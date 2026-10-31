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
      current.prompt.referenceMode = short ? 'short' : 'full'
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
    shortConfig.prompt.referenceMode = 'short'
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
    assert(full.includes('首帧画面 [画面.png] ，原样@') && full.includes('X [X.png] Y [Y.png] \nZ [Z.png] '), 'first-frame or spacing wrong')
    current.prompt.referenceMode = 'short'
    const detail = composeShotDetail(current, shot, profile.id)
    assert(detail.includes('前缀 [镜头.v2] 。'), 'short filename stem changed')
    assert(composePrompt(current, shot, profile.id).endsWith(`三、分镜详情\n${detail}`), 'detail converted more than once')
    assert(shot.text === original && profile.basePrefix.includes('[图片]'), 'stored source or scheme mutated')
  })
  await test('Handwritten shot references repeat their content while generated references retain their format', () => {
    const shot = createShot()
    shot.text = 'AA[BB]，dd。\n甲：看[背景]，再看[另一处]。\n音色是[甲]，音色参考 [乙]。\n[已有.png][声音.mp3]，空[]，未闭合[结束'
    shot.characters = [createCharacterConfig('甲', true)]
    const source = shot.text
    for (const short of [false, true]) {
      const full = composePrompt(config, shot, undefined, 8, [], '5-6', short ? 'short' : 'full')
      const detail = composeShotDetail(config, shot, undefined, 8, [], '5-6', short ? 'short' : 'full')
      assert(detail.startsWith(`AABB [${short ? 'BB' : 'BB.png'}] ，dd。`), 'handwritten reference not repeated exactly once')
      assert(detail.includes(`看背景 [${short ? '背景' : '背景.png'}] `), 'dialogue reference not repeated')
      assert(detail.includes(`音色是甲 [${short ? '甲.' : '甲.mp3'}] `) && detail.includes(`音色参考 乙 [${short ? '乙.' : '乙.mp3'}] `), 'voice context lost during expansion')
      assert(detail.includes(`已有.png [${short ? '已有' : '已有.png'}] 声音.mp3 [${short ? '声音.' : '声音.mp3'}] `), 'explicit extensions changed')
      assert(detail.includes('空 [] ') && detail.endsWith('未闭合[结束'), 'empty or unclosed references changed')
      assert(full.includes(`多角色位置参考 [${short ? '5-6' : '5-6.png'}] `), 'generated position reference expanded')
      assert(full.includes(`甲的妆造是 [${short ? '甲' : '甲.png'}] ，音色是 [${short ? '甲.' : '甲.mp3'}] `), 'generated character reference expanded')
      assert(full.endsWith(`三、分镜详情\n${detail}`), 'copy entrances differ')
    }
    assert(shot.text === source, 'source rewritten')
  })
  await test('All four modes render automatic references while retaining manual brackets and source text', () => {
    const shot = createShot()
    shot.firstFrameMode = true
    shot.characters = [createCharacterConfig('宋绪', true)]
    shot.text = '（（@））\n宋绪OS（情绪坚定）：继续。\nVO：旁白。\n配饰[徽章]，音色参考[手填]。'
    const source = shot.text
    const assets = [createCharacterAsset('宋绪', '黑色外套', '低沉男声')]
    for (const mode of ['basic', 'short', 'full', 'detailed'] as const) {
      const full = composePrompt(config, shot, undefined, 8, assets, '10-6', mode, '10-1')
      const detail = composeShotDetail(config, shot, undefined, 8, assets, '10-6', mode)
      if (mode === 'basic') {
        assert(full.includes('宋绪的妆造是@，黑色外套，音色是@，低沉男声。'), 'basic character references resolved')
        assert(full.includes('多角色位置参考@') && detail.includes('\n@\n'), 'basic position or first-frame resolved')
        assert(detail.includes('宋绪OS（情绪坚定，嘴巴紧闭，音色参考@）'), 'basic OS voice resolved')
      } else {
        const appearance = mode === 'short' ? '宋绪' : mode === 'detailed' ? '10-1宋绪.png' : '宋绪.png'
        const voice = mode === 'short' ? '宋绪.' : '宋绪.mp3'
        const position = mode === 'short' ? '10-6' : '10-6.png'
        assert(full.includes(`宋绪的妆造是 [${appearance}] ，黑色外套，音色是 [${voice}] ，低沉男声。`), mode + ': character references wrong')
        assert(full.includes(`多角色位置参考 [${position}] `) && detail.includes(`\n [${position}] \n`), mode + ': position or first-frame wrong')
        assert(detail.includes(`宋绪OS（情绪坚定，嘴巴紧闭，音色参考 [${voice}] ）`), mode + ': OS voice wrong')
      }
      assert(detail.includes(`配饰徽章 [${mode === 'short' ? '徽章' : '徽章.png'}] `), mode + ': manual image changed')
      assert(detail.includes(`音色参考手填 [${mode === 'short' ? '手填.' : '手填.mp3'}] `), mode + ': manual voice changed')
      assert(detail.includes('VO（音色参考@）：旁白。'), mode + ': unknown voice resolved')
      assert(full.endsWith(`三、分镜详情\n${detail}`), mode + ': detail entrance differs')
    }
    assert(shot.text === source && assets[0].appearanceDescription === '黑色外套', 'stored source changed')
  })
  await test('Detailed appearance prefixes follow actual episode and unit; voice and manual references stay unprefixed', () => {
    const shot = createShot()
    shot.characters = [createCharacterConfig('宋绪', true)]
    shot.text = '宋绪VO：出发。\n道具[宋绪]。'
    for (const prefix of ['10-1', '10-2', '11-1']) {
      const full = composePrompt(config, shot, undefined, 8, [], '10-9', 'detailed', prefix)
      assert(full.includes(`宋绪的妆造是 [${prefix}宋绪.png] `), 'appearance prefix missing: ' + prefix)
      assert(full.includes('音色是 [宋绪.mp3] ') && full.includes('音色参考 [宋绪.mp3] '), 'voice gained appearance prefix')
      assert(full.includes('道具宋绪 [宋绪.png] ') && full.includes('多角色位置参考 [10-9.png] '), 'manual or position reference gained prefix')
    }
  })
  await test('Ensemble output remains name and appearance across all reference modes', () => {
    const shot = createShot()
    shot.characters = [createCharacterConfig('村民们', true)]
    const assets = [createCharacterAsset('村民们', '衣着各异')]
    for (const mode of ['basic', 'short', 'full', 'detailed'] as const) {
      const full = composePrompt(config, shot, undefined, 8, assets, '10-6', mode, '10-1')
      assert(full.includes('村民们，衣着各异。') && !full.includes('的妆造是') && !full.includes('音色是'), mode + ': ensemble gained references')
    }
  })
  await test('Legacy flags migrate to modes; cloning and merges retain ungrouped options', () => {
    assert(config.prompt.referenceMode === 'full', 'runtime default should be full')
    const legacy = JSON.parse(JSON.stringify(config))
    delete legacy.prompt.referenceMode
    assert(normalizeGlobalConfig(legacy)!.prompt.referenceMode === 'full', 'legacy missing default')
    for (const short of [false, true]) {
      legacy.prompt.useShortReferenceNames = short
      assert(normalizeGlobalConfig(legacy)!.prompt.referenceMode === (short ? 'short' : 'full'), 'legacy flag not migrated')
    }
    for (const mode of ['basic', 'short', 'full', 'detailed'] as const) {
      const local = cloneGlobalConfig(config)
      local.prompt.referenceMode = mode
      assert(normalizeGlobalConfig(local)!.prompt.referenceMode === mode, 'normalization lost mode')
      assert(cloneGlobalConfig(local).prompt.referenceMode === mode, 'clone lost mode')
      assert(mergeGlobalConfigs(local, config).prompt.referenceMode === mode, 'merge replaced local choice')
    }
    legacy.prompt.referenceMode = 'basic'
    assert(normalizeGlobalConfig(legacy)!.prompt.referenceMode === 'basic', 'new mode should override legacy flag')
  })
  await test('IndexedDB, JSON and downloaded settings preserve or replace ungrouped options', async () => {
    const state = createInitialState(config)
    state.globalConfig.prompt.referenceMode = 'basic'
    state.globalConfig.prompt.colorGrading = true
    state.globalConfig.prompt.filter = true
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    assert((await repository.load(config)).globalConfig.prompt.referenceMode === 'basic', 'reload lost choice')
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    assert(assembleDataFiles(files, state).globalConfig.prompt.referenceMode === 'basic', 'JSON lost choice')
    assert(assembleDataFiles(files, state).globalConfig.prompt.colorGrading && assembleDataFiles(files, state).globalConfig.prompt.filter, 'ungrouped flags lost')
    assert(mergeDownloadedFiles(createInitialState(config), files).globalConfig.prompt.referenceMode === 'basic', 'download did not apply mode')
    assert(mergeDownloadedFiles(state, buildDataFiles(createInitialState(config))).globalConfig.prompt.referenceMode === 'full', 'download did not apply full')
    const settings = JSON.parse(JSON.stringify(files.get('settings.json')))
    delete settings.globalConfig.prompt.referenceMode
    settings.globalConfig.prompt.useShortReferenceNames = true
    files.set('settings.json', parseDataFile(JSON.stringify(settings), 'settings.json'))
    assert(mergeDownloadedFiles(state, files).globalConfig.prompt.referenceMode === 'short', 'legacy download should migrate flag')
    repository.close()
  })
  await test('Each group retains independent flags and can override ungrouped reference mode', async () => {
    const state = createInitialState(config)
    state.globalConfig.prompt.referenceMode = 'basic'
    const first = createEpisodeGroup(config.prompt.activeProfileId)
    const second = createEpisodeGroup(config.prompt.activeProfileId)
    first.colorGrading = true
    second.filter = true
    second.referenceMode = 'detailed'
    state.episodeGroups = [first, second]
    state.episodes[0].groupId = first.id
    state.episodes[0].shots[0].firstFrameMode = true
    const shot = state.episodes[0].shots[0]
    const full = composePrompt(state.globalConfig, shot, first.promptProfileId, 8, [], '5-6', first.referenceMode)
    const detailed = composePrompt(state.globalConfig, shot, second.promptProfileId, 8, [], '5-6', second.referenceMode, '5-1')
    assert(full.includes('多角色位置参考 [5-6.png] ') && full.includes('\n [5-6.png] \n'), 'group false did not override ungrouped true')
    assert(detailed.includes('多角色位置参考 [5-6.png] ') && detailed.includes('\n [5-6.png] \n'), 'detailed group inherited ungrouped mode')
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    const reloaded = await repository.load(config)
    assert(reloaded.episodeGroups[0].colorGrading && !reloaded.episodeGroups[0].filter && reloaded.episodeGroups[0].referenceMode === 'full', 'first group options lost')
    assert(!reloaded.episodeGroups[1].colorGrading && reloaded.episodeGroups[1].filter && reloaded.episodeGroups[1].referenceMode === 'detailed', 'second group options lost')
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const imported = assembleDataFiles(files, state)
    assert(canonicalJson(imported.episodeGroups) === canonicalJson(state.episodeGroups), 'JSON changed group flags')
    const downloaded = mergeDownloadedFiles(createInitialState(config), files)
    assert(downloaded.episodeGroups[0].colorGrading && downloaded.episodeGroups[1].filter && downloaded.episodeGroups[1].referenceMode === 'detailed', 'WebDAV lost group options')
    repository.close()
  })
  await test('Legacy groups migrate independently without inheriting ungrouped mode', () => {
    const state = createInitialState(config)
    state.globalConfig.prompt.referenceMode = 'basic'
    state.episodeGroups = [createEpisodeGroup(config.prompt.activeProfileId)]
    const legacy = JSON.parse(JSON.stringify(state))
    delete legacy.episodeGroups[0].referenceMode
    delete legacy.episodeGroups[0].colorGrading
    delete legacy.episodeGroups[0].filter
    const migrated = normalizeAppState(legacy, config)
    assert(migrated.episodeGroups[0].referenceMode === 'full', 'missing group mode should default full')
    assert(!migrated.episodeGroups[0].colorGrading && !migrated.episodeGroups[0].filter, 'new flags should default false')
    for (const short of [false, true]) {
      legacy.episodeGroups[0].useShortReferenceNames = short
      const reloaded = normalizeAppState(legacy, config)
      assert(reloaded.episodeGroups[0].referenceMode === (short ? 'short' : 'full'), 'legacy group flag not migrated')
      assert(reloaded.globalConfig.prompt.referenceMode === 'basic', 'group changed ungrouped mode')
      assert(!('useShortReferenceNames' in reloaded.episodeGroups[0]), 'legacy group flag retained')
    }
    legacy.episodeGroups[0].referenceMode = 'detailed'
    assert(normalizeAppState(legacy, config).episodeGroups[0].referenceMode === 'detailed', 'explicit mode should override legacy flag')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
