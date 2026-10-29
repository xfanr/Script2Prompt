import { cloneGlobalConfig, mergeGlobalConfigs, normalizeGlobalConfig } from '../src/config'
import { createCharacterAsset, createCharacterConfig, createEpisodeGroup, createInitialState, createShot } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, canonicalJson, mergeDownloadedFiles, parseDataFile } from '../src/dataFiles'
import { composePrompt, composeShotDetail } from '../src/prompt'
import { LocalRepository } from '../src/storage'
import { normalizeAppState } from '../src/stateNormalization'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runReferenceNameTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await test('Automatic position, first-frame, appearance and voice references honor both global modes', () => {
    const shot = createShot()
    shot.characters = [createCharacterConfig('温妤', true)]
    shot.firstFrameMode = true
    shot.text = '（（@））\n温妤OS：继续。\n温妤VO：收到。\n温妤手机VO：你好。\nVO：旁白。\n手机VO：未知。'
    const assets = [createCharacterAsset('温妤')]
    for (const short of [false, true]) {
      const current = cloneGlobalConfig(config)
      current.prompt.useShortReferenceNames = short
      for (const profile of current.prompt.profiles) {
        const full = composePrompt(current, shot, profile.id, 8, assets, '5-6')
        const detail = composeShotDetail(current, shot, profile.id, 8, assets, '5-6')
        const image = short ? '温妤' : '温妤.png'
        const voice = short ? '温妤.' : '温妤.mp3'
        const position = short ? '5-6' : '5-6.png'
        assert(full.includes(`多角色位置参考 [${position}] `) && detail.includes(`\n [${position}] \n`), 'position/first-frame mode differs')
        assert(full.includes(`温妤的妆造是 [${image}] ，音色是 [${voice}] `), 'character reference mode wrong')
        assert(detail.includes(`温妤OS（嘴巴紧闭，音色参考 [${voice}] ）`), 'OS voice mode wrong')
        assert(detail.includes(`温妤VO（音色参考 [${voice}] ）`) && detail.includes(`温妤手机传来的VO（音色参考 [${voice}] ）`), 'VO voice mode wrong')
        assert(detail.includes('VO（音色参考@）：旁白。') && detail.includes('手机传来的VO（音色参考@）：未知。'), 'unknown speaker inferred')
        assert(full.endsWith(`三、分镜详情\n${detail}`), 'full/detail outputs differ')
      }
    }
    assert(shot.text.startsWith('（（@））') && !shot.text.includes('.mp3'), 'source text mutated')
  })
  await test('Manual references infer voice context and retain existing extensions without duplication', () => {
    const shot = createShot()
    shot.text = '图[场景]，音色是[甲]，音色参考 [乙]，[丙.]，[丁.mp3]，[原图.png]，[照片.JPG]。正文@'
    const full = composeShotDetail(config, shot)
    for (const name of ['场景.png', '甲.mp3', '乙.mp3', '丙.mp3', '丁.mp3', '原图.png', '照片.JPG']) {
      assert(full.includes(` [${name}] `), `missing filename: ${name}`)
    }
    assert(!full.includes('.png.png') && !full.includes('..mp3') && full.endsWith('正文@'), 'duplicate suffix or custom at sign changed')
    const shortConfig = cloneGlobalConfig(config)
    shortConfig.prompt.useShortReferenceNames = true
    const short = composeShotDetail(shortConfig, shot)
    for (const name of ['场景', '甲.', '乙.', '丙.', '丁.', '原图', '照片']) assert(short.includes(` [${name}] `), `missing short name: ${name}`)
  })
  await test('Scheme and custom first-frame references convert once while retaining bracket spacing', () => {
    const current = cloneGlobalConfig(config)
    const profile = current.prompt.profiles[0]
    profile.basePrefix = '基础[图片]，音色参考[甲]。'
    profile.sceneRoleSuffix = '设定[场景.png]。'
    profile.shotPrefix = '前缀[镜头.v2.png]。'
    const shot = createShot()
    shot.firstFrameMode = true
    shot.text = '（（首帧[画面]，原样@））\n[X][Y]\n[Z]'
    const original = shot.text
    const full = composePrompt(current, shot, profile.id)
    assert(full.includes('基础 [图片.png] ，音色参考 [甲.mp3] 。') && full.includes('设定 [场景.png] 。'), 'scheme references missing')
    assert(full.includes('首帧 [画面.png] ，原样@') && full.includes(' [X.png] [Y.png] \n [Z.png] '), 'first-frame or spacing wrong')
    current.prompt.useShortReferenceNames = true
    const detail = composeShotDetail(current, shot, profile.id)
    assert(detail.includes('前缀 [镜头.v2] 。'), 'short filename stem changed')
    assert(composePrompt(current, shot, profile.id).endsWith(`三、分镜详情\n${detail}`), 'detail converted more than once')
    assert(shot.text === original && profile.basePrefix.includes('[图片]'), 'stored source or scheme mutated')
  })
  await test('Missing legacy flag defaults off; cloning and merges retain ungrouped options', () => {
    assert(config.prompt.useShortReferenceNames === false, 'runtime default should be off')
    const legacy = JSON.parse(JSON.stringify(config))
    delete legacy.prompt.useShortReferenceNames
    assert(normalizeGlobalConfig(legacy)!.prompt.useShortReferenceNames === false, 'legacy flag missing default')
    const local = cloneGlobalConfig(config)
    local.prompt.useShortReferenceNames = true
    assert(normalizeGlobalConfig(local)!.prompt.useShortReferenceNames, 'normalization lost flag')
    assert(cloneGlobalConfig(local).prompt.useShortReferenceNames, 'clone lost flag')
    assert(mergeGlobalConfigs(local, config).prompt.useShortReferenceNames, 'merge replaced local choice')
  })
  await test('IndexedDB, JSON and downloaded settings preserve or replace ungrouped options', async () => {
    const state = createInitialState(config)
    state.globalConfig.prompt.useShortReferenceNames = true
    state.globalConfig.prompt.colorGrading = true
    state.globalConfig.prompt.filter = true
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    assert((await repository.load(config)).globalConfig.prompt.useShortReferenceNames, 'reload lost choice')
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    assert(assembleDataFiles(files, state).globalConfig.prompt.useShortReferenceNames, 'JSON lost choice')
    assert(assembleDataFiles(files, state).globalConfig.prompt.colorGrading && assembleDataFiles(files, state).globalConfig.prompt.filter, 'ungrouped flags lost')
    assert(mergeDownloadedFiles(createInitialState(config), files).globalConfig.prompt.useShortReferenceNames, 'download did not apply true')
    assert(!mergeDownloadedFiles(state, buildDataFiles(createInitialState(config))).globalConfig.prompt.useShortReferenceNames, 'download did not apply false')
    const settings = JSON.parse(JSON.stringify(files.get('settings.json')))
    delete settings.globalConfig.prompt.useShortReferenceNames
    files.set('settings.json', parseDataFile(JSON.stringify(settings), 'settings.json'))
    assert(!mergeDownloadedFiles(state, files).globalConfig.prompt.useShortReferenceNames, 'legacy download should default off')
  })
  await test('Each group retains independent flags and can override ungrouped reference mode', async () => {
    const state = createInitialState(config)
    state.globalConfig.prompt.useShortReferenceNames = true
    const first = createEpisodeGroup(config.prompt.activeProfileId)
    const second = createEpisodeGroup(config.prompt.activeProfileId)
    first.colorGrading = true
    second.filter = true
    second.useShortReferenceNames = true
    state.episodeGroups = [first, second]
    state.episodes[0].groupId = first.id
    state.episodes[0].shots[0].firstFrameMode = true
    const shot = state.episodes[0].shots[0]
    const full = composePrompt(state.globalConfig, shot, first.promptProfileId, 8, [], '5-6', first.useShortReferenceNames)
    const short = composePrompt(state.globalConfig, shot, second.promptProfileId, 8, [], '5-6', second.useShortReferenceNames)
    assert(full.includes('多角色位置参考 [5-6.png] ') && full.includes('\n [5-6.png] \n'), 'group false did not override ungrouped true')
    assert(short.includes('多角色位置参考 [5-6] ') && short.includes('\n [5-6] \n'), 'group true did not use short names')
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    const reloaded = await repository.load(config)
    assert(reloaded.episodeGroups[0].colorGrading && !reloaded.episodeGroups[0].filter && !reloaded.episodeGroups[0].useShortReferenceNames, 'first group flags lost')
    assert(!reloaded.episodeGroups[1].colorGrading && reloaded.episodeGroups[1].filter && reloaded.episodeGroups[1].useShortReferenceNames, 'second group flags lost')
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const imported = assembleDataFiles(files, state)
    assert(canonicalJson(imported.episodeGroups) === canonicalJson(state.episodeGroups), 'JSON changed group flags')
    const downloaded = mergeDownloadedFiles(createInitialState(config), files)
    assert(downloaded.episodeGroups[0].colorGrading && downloaded.episodeGroups[1].filter && downloaded.episodeGroups[1].useShortReferenceNames, 'WebDAV lost group flags')
  })
  await test('Groups missing a short-name preference default off without inheriting ungrouped mode', () => {
    const state = createInitialState(config)
    state.globalConfig.prompt.useShortReferenceNames = true
    state.episodeGroups = [createEpisodeGroup(config.prompt.activeProfileId)]
    const legacy = JSON.parse(JSON.stringify(state))
    delete legacy.episodeGroups[0].useShortReferenceNames
    delete legacy.episodeGroups[0].colorGrading
    delete legacy.episodeGroups[0].filter
    const migrated = normalizeAppState(legacy, config)
    assert(!migrated.episodeGroups[0].useShortReferenceNames, 'missing group preference should default off')
    assert(!migrated.episodeGroups[0].colorGrading && !migrated.episodeGroups[0].filter, 'new flags should default false')
    migrated.episodeGroups[0].useShortReferenceNames = false
    const reloaded = normalizeAppState(migrated, config)
    assert(!reloaded.episodeGroups[0].useShortReferenceNames && reloaded.globalConfig.prompt.useShortReferenceNames, 'explicit group false was replaced by ungrouped preference')
    migrated.episodeGroups[0].useShortReferenceNames = true
    assert(normalizeAppState(migrated, config).episodeGroups[0].useShortReferenceNames, 'explicit short-name selection should be retained')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
