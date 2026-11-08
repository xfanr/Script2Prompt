import { normalizeGlobalConfig } from '../src/config'
import { createEpisode, createEpisodeGroup, createInitialState, createSceneAsset, createSceneConfig, createShot, normalizeShotSceneSelection, sceneAssetKey, STORAGE_KEY } from '../src/defaults'
import { buildDataFiles, assembleDataFiles, mergeDownloadedFiles, parseDataFile } from '../src/dataFiles'
import { composePrompt, composeSceneSettings, composeShotDetail } from '../src/prompt'
import { continuousEpisodes, formatShotNumber, formatShotReference, reconcileShotReferences } from '../src/shotNumber'
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
  await test('State migration keeps one scene and the selected position reference mode', async () => {
    const migrated = normalizeAppState(state, config)
    const migratedShot = migrated.episodes[0].shots[0]
    assert(migratedShot.scenes.length === 1 && migratedShot.scenes[0].name === 'Office', 'multiple scenes remain')
    assert(migratedShot.scenes[0].time === '深夜' && migratedShot.scenes[0].space === '室外' && migratedShot.scenes[0].statusText === 'Rain', 'scene configuration changed')
    assert(!migratedShot.usePositionReference && !migratedShot.useReverseAngle, 'position reference mode changed')
    assert(migrated.episodes[0].props[0] === 'legacy prop', 'compatibility field lost')
  })
  await test('Legacy browser storage migrates and reloads the single scene', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = new LocalRepository(storage, testDatabaseName())
    await repository.load(config)
    const reloaded = (await repository.load(config)).episodes[0].shots[0]
    assert(reloaded.scenes.length === 1 && reloaded.scenes[0].statusText === 'Rain' && !reloaded.usePositionReference, 'storage roundtrip changed configuration')
  })
  await test('Data-file import normalizes multiple scenes and disabled position reference', async () => {
    const imported = assembleDataFiles(buildDataFiles(state)).episodes[0].shots[0]
    assert(imported.scenes.length === 1 && imported.scenes[0].name === 'Office' && !imported.usePositionReference, 'data-file import did not preserve scene configuration')
  })
  await test('Disabled positioning adds the scene time and name reference and preserves existing scene state', async () => {
    const text = composeSceneSettings({ ...shot, scenes: [selected] })
    assert(text.includes('深夜，室外，Office，Rain [深夜·Office] ') && !text.includes('多角色位置参考'), 'scene reference or state incorrect')
  })
  await test('Positioning defaults on for new and legacy shots and scene references follow output modes', () => {
    assert(createShot().usePositionReference, 'new shot default disabled')
    const legacy = JSON.parse(JSON.stringify(state))
    delete legacy.episodes[0].shots[0].usePositionReference
    assert(normalizeAppState(legacy, config).episodes[0].shots[0].usePositionReference, 'legacy default disabled')
    const current = createShot()
    current.scenes = [createSceneConfig('民政局门口', '白天', '室外')]
    current.usePositionReference = false
    current.firstFrameMode = true
    current.text = '（（@））\n正文'
    for (const mode of ['basic', 'detailed'] as const) {
      const text = composePrompt(config, current, undefined, 8, [], '5-6', mode)
      const sceneName = '白天·民政局门口.png'
      assert(text.includes(`白天，室外，民政局门口${mode === 'basic' ? '@' : ` [${sceneName}] `}`), mode + ': incorrect scene reference')
      if (mode === 'basic') assert(!text.includes('[民政局门口'), 'basic mode added brackets')
      assert(!text.includes('多角色位置参考'), mode + ': position reference remains')
      assert(!text.includes('[室外') && !text.includes('[白天·室外'), 'space added to scene reference name')
      assert(mode === 'basic' ? text.includes('\n@\n') : text.includes(`\n [5-6.png] \n`), 'first frame affected by positioning switch')
    }
    current.usePositionReference = true
    const text = composePrompt(config, current, undefined, 8, [], '5-6')
    assert(text.includes('多角色位置参考 [5-6.png] ') && !text.includes('[民政局门口'), 're-enabling positioning retained scene reference')
    current.scenes[0].name = ''
    current.usePositionReference = false
    assert(!composeSceneSettings(current).includes('[]'), 'empty scene added a reference')
  })
  await test('Same-named day and night scenes remain separate through load, JSON and WebDAV', () => {
    const stored = createInitialState(config), episode = stored.episodes[0]
    const day = createSceneAsset('民政局', '白天', '室外')
    const night = createSceneAsset('民政局', '深夜', '室内')
    episode.scenes = [day, night, { ...day }]
    episode.shots = [createShot(), createShot()]
    episode.shots[0].scenes = [createSceneConfig(day.name, day.time, day.space)]
    episode.shots[1].scenes = [createSceneConfig(night.name, night.time, night.space)]
    for (const shot of episode.shots) delete (shot.scenes[0] as Partial<typeof shot.scenes[0]>).space
    const files = new Map([...buildDataFiles(stored)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    for (const loaded of [normalizeAppState(stored, config), assembleDataFiles(files, stored), mergeDownloadedFiles(createInitialState(config), files)]) {
      const result = loaded.episodes.find(item => item.id === episode.id)!
      assert(result.scenes.length === 2, 'time variants collapsed or exact duplicates retained')
      assert(sceneAssetKey(result.scenes[0]) !== sceneAssetKey(result.scenes[1]), 'time omitted from scene identity')
      assert(result.shots[0].scenes[0].space === '室外' && result.shots[1].scenes[0].space === '室内', 'shot loaded metadata from the wrong time variant')
    }
    const legacy = JSON.parse(JSON.stringify(stored))
    delete legacy.episodes[0].shots[0].scenes[0].time
    assert(normalizeAppState(legacy, config).episodes[0].shots[0].scenes[0].time === '白天', 'legacy missing-time scene changed')
  })
  await test('Time-prefixed scene references follow each shot while basic and position references stay intact', () => {
    for (const time of ['白天', '深夜'] as const) {
      const current = createShot()
      current.scenes = [createSceneConfig('民政局', time, '室外')]
      current.usePositionReference = false
      const detailed = composePrompt(config, current, undefined, 8, [], '5-1-1', 'detailed')
      assert(detailed.includes(`分镜场景设定在${time}，室外，民政局 [${time}·民政局.png] `), 'time-prefixed file reference missing')
      const basic = composePrompt(config, current, undefined, 8, [], '5-1-1', 'basic')
      assert(basic.includes(`分镜场景设定在${time}，室外，民政局@`) && !basic.includes(`[${time}·民政局`), 'basic no longer uses @')
      current.usePositionReference = true
      const position = composePrompt(config, current, undefined, 8, [], '5-1-1', 'detailed')
      assert(position.includes('[5-1-1.png]') && !position.includes(`[${time}·民政局`), 'position reference gained a scene filename')
    }
  })
  await test('Reference defaults span units and selected numbers drive both prompt references', () => {
    const episode = createInitialState(config).episodes[0]
    episode.title = '第 05 集'
    episode.shots = Array.from({ length: 8 }, (_, index) => createShot(Math.min(index + 1, 3)))
    const current = episode.shots[5]
    assert(formatShotNumber(episode, 5) === '5-3-4', 'actual shot number changed')
    assert(formatShotReference(episode, 5) === '5-3-4', 'default is not the full formal shot number')
    current.referenceShotNumber = 6
    current.firstFrameMode = true
    current.text = '（（@））\n正文@'
    const referenceName = formatShotReference(episode, 5)
    const detail = composeShotDetail(config, current, undefined, 8, [], referenceName)
    const full = composePrompt(config, current, undefined, 8, [], referenceName)
    assert(full.includes('多角色位置参考 [5-3-4.png] '), 'selected position reference missing')
    assert(detail.includes('\n [5-3-4.png] \n') && full.endsWith(`三、分镜详情\n${detail}`), 'first-frame reference or shared detail mismatch')
    assert(detail.endsWith('正文@') && current.text === '（（@））\n正文@', 'custom at sign or source changed')
    current.referenceShotNumber = 8
    episode.shots[0].referenceShotNumber = 8
    assert(formatShotReference(episode, 0) === '5-3-6', 'duplicate selection not allowed')
    episode.shots.reverse()
    assert(formatShotReference(episode, 2) === '5-1-1', 'manual reference followed its target instead of retaining number')
    assert(formatShotReference(episode, 0) === '5-3-1', 'default did not follow own reordered position')
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
    stored.episodes[0].shots[0].usePositionReference = false
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(stored)
    assert((await repository.load(config)).episodes[0].shots[0].referenceShotNumber === 2, 'IndexedDB lost reference')
    assert(!(await repository.load(config)).episodes[0].shots[0].usePositionReference, 'IndexedDB lost positioning choice')
    const files = new Map([...buildDataFiles(stored)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    assert(assembleDataFiles(files, stored).episodes[0].shots[0].referenceShotNumber === 2, 'JSON lost reference')
    assert(mergeDownloadedFiles(createInitialState(config), files).episodes[0].shots[0].referenceShotNumber === 2, 'download lost reference')
    assert(!mergeDownloadedFiles(createInitialState(config), files).episodes[0].shots[0].usePositionReference, 'download lost positioning choice')
    stored.episodes[0].shots.pop()
    const shrunk = normalizeAppState(stored, config)
    assert(shrunk.episodes[0].shots[0].referenceShotNumber === null, 'out-of-range reference retained after shrink')
  })
  await test('Both source menus use the whole uninterrupted episode block', () => {
    const episodes = [9, 2, 12, 4, 8, 6, 3, 5].map(number => createEpisode(number))
    episodes.forEach(episode => episode.groupId = 'drama')
    const numbers = (number: number) => continuousEpisodes(episodes, episodes.find(episode => episode.title.includes(String(number).padStart(2, '0')))!)
      .map(episode => Number(episode.title.match(/\d+/)![0])).join(',')
    assert(numbers(2) === '2,3,4,5,6' && numbers(5) === '2,3,4,5,6', 'block does not extend in both directions')
    assert(numbers(8) === '8,9' && numbers(12) === '12', 'gap was crossed or local options lost')
    episodes.find(episode => episode.title.includes('04'))!.groupId = 'foreign'
    assert(numbers(2) === '2,3' && numbers(5) === '5,6', 'foreign group bridged a gap')
    episodes.forEach(episode => episode.groupId = null)
    assert(numbers(2) === '2,3,4,5,6', 'ungrouped source collection changed')
    episodes[0].title = '未命名单集'
    assert(continuousEpisodes(episodes, episodes[0]).length === 1, 'invalid episode number gained cross-episode sources')
  })
  await test('Cross-episode references use selected source units in positioning and first frames', () => {
    const current = createEpisode(2), middle = createEpisode(3), source = createEpisode(4)
    current.shots[0].referenceEpisodeId = source.id
    current.shots[0].referenceShotNumber = 3
    current.shots[0].firstFrameMode = true
    current.shots[0].text = '（（@））\n正文@'
    source.shots = [createShot(1), createShot(2), createShot(2)]
    const episodes = [current, middle, source]
    reconcileShotReferences(episodes)
    const reference = formatShotReference(current, 0, episodes)
    assert(reference === '4-2-2', 'cross-episode source numbering incorrect')
    const full = composePrompt(config, current.shots[0], undefined, 8, [], reference, 'detailed')
    const detail = composeShotDetail(config, current.shots[0], undefined, 8, [], reference, 'detailed')
    assert(full.includes('多角色位置参考 [4-2-2.png] ') && detail.includes('\n [4-2-2.png] \n'), 'copy and preview reference mismatch')
    const basic = composePrompt(config, current.shots[0], undefined, 8, [], reference, 'basic')
    assert(basic.includes('多角色位置参考@') && !basic.includes('[4-2-2'), 'basic mode no longer uses @')
    assert(source.shots.every(shot => shot.referenceShotNumber === null), 'source data changed')
  })
  await test('Cross-episode choices survive storage and file roundtrips even when source has more shots', async () => {
    const stored = createInitialState(config), group = createEpisodeGroup(config.prompt.activeProfileId)
    const source = createEpisode(2)
    source.shots = [createShot(1), createShot(2), createShot(2)]
    stored.episodes.push(source)
    stored.episodeGroups = [group]
    stored.episodes.forEach(episode => episode.groupId = group.id)
    const target = stored.episodes[0].shots[0]
    target.referenceEpisodeId = source.id
    target.referenceShotNumber = 3
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(stored)
    const files = new Map([...buildDataFiles(stored)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    for (const loaded of [await repository.load(config), assembleDataFiles(files, stored), mergeDownloadedFiles(createInitialState(config), files)]) {
      const episode = loaded.episodes.find(episode => episode.id === stored.episodes[0].id)!
      assert(episode.shots[0].referenceEpisodeId === source.id && episode.shots[0].referenceShotNumber === 3, 'cross-episode choice lost')
      assert(formatShotReference(episode, 0, loaded.episodes) === '2-2-2', 'roundtrip changed reference output')
    }
  })
  await test('Removed sources, broken continuity and shortened sources restore the local default', () => {
    const current = createEpisode(2), middle = createEpisode(3), source = createEpisode(4)
    const foreignGroup = createEpisodeGroup(config.prompt.activeProfileId)
    source.shots.push(createShot())
    for (const change of ['gap', 'group', 'delete', 'shrink']) {
      current.shots[0].referenceEpisodeId = source.id
      current.shots[0].referenceShotNumber = 2
      middle.title = '第 03 集'; source.groupId = null; source.shots = [createShot(), createShot()]
      if (change === 'gap') middle.title = '第 09 集'
      if (change === 'group') source.groupId = foreignGroup.id
      if (change === 'shrink') source.shots.pop()
      const episodes = change === 'delete' ? [current, middle] : [current, middle, source]
      const loaded = normalizeAppState({ ...state, episodeGroups: [foreignGroup], episodes }, config)
      assert(loaded.episodes[0].shots[0].referenceEpisodeId === null && loaded.episodes[0].shots[0].referenceShotNumber === null, change + ': invalid source retained')
      assert(formatShotReference(loaded.episodes[0], 0, loaded.episodes) === '2-1-1', change + ': local default not restored')
    }
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
