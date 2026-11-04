import { activeEnsembleAppearanceTemplate, cloneGlobalConfig, mergeGlobalConfigs, normalizeGlobalConfig } from '../src/config'
import { createCharacterAsset, createCharacterConfig, createInitialState, normalizeCharacterAssets } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, parseDataFile } from '../src/dataFiles'
import { composeCharacterSettings, composePrompt } from '../src/prompt'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runCharacterVoiceTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const fixture = () => {
    const state = createInitialState(config)
    const episode = state.episodes[0]
    episode.characters = [createCharacterAsset('程鹏', '', '20岁男性浑厚音')]
    episode.characters[0].voiceDescriptionEnabled = true
    episode.shots[0].characters = [createCharacterConfig('程鹏', true)]
    return state
  }
  await test('Ensemble suffixes apply only to new assets and manual overrides survive loading', () => {
    for (const name of ['村民们', '保安群像', '路人若干']) assert(createCharacterAsset(name).isEnsemble, 'ensemble suffix not detected: ' + name)
    for (const name of ['他们的队长', '群像演员', '程鹏']) assert(!createCharacterAsset(name).isEnsemble, 'non-suffix name misclassified: ' + name)
    const assets = normalizeCharacterAssets(['村民们', { name: '保安群像' }, createCharacterAsset('路人若干', '', '', false), createCharacterAsset('群众', '', '', true)])
    assert(assets.slice(0, 3).every(asset => !asset.isEnsemble) && assets[3].isEnsemble, 'legacy defaults or explicit flags changed')
  })
  await test('Ensembles output name, appearance and status without appearance or voice references', () => {
    const state = fixture()
    const episode = state.episodes[0]
    episode.characters = [createCharacterAsset('村民们', '男女老少，穿着各异', '不应输出的音色')]
    episode.shots[0].characters = [createCharacterConfig('村民们', true)]
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === '村民们。', 'disabled ensemble description rendered')
    episode.characters[0].appearanceDescriptionEnabled = true
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === '村民们，男女老少，穿着各异。', 'ensemble output incorrect')
    episode.shots[0].characters[0].statusText = '站在广场上'
    assert(composeCharacterSettings(episode.shots[0], episode.characters, true) === '村民们，男女老少，穿着各异，站在广场上。', 'ensemble status lost')
    assert(!composePrompt(config, episode.shots[0], undefined, undefined, episode.characters).includes('村民们.png'), 'ensemble got an appearance reference')
    episode.characters[0].isEnsemble = false
    assert(composeCharacterSettings(episode.shots[0], episode.characters).includes('的妆造是@') && composeCharacterSettings(episode.shots[0], episode.characters).includes('音色是@'), 'manual switch did not restore normal rendering')
  })
  await test('Ensemble state and template persist through IndexedDB, JSON and downloaded files', async () => {
    const state = fixture()
    state.episodes[0].characters[0].isEnsemble = true
    state.globalConfig.prompt.ensembleAppearanceTemplates.push({ id: 'custom-template', name: '自定义模板', content: '自定义群像模板\n保留换行' })
    state.globalConfig.prompt.activeEnsembleAppearanceTemplateId = 'custom-template'
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    const loaded = await repository.load(config)
    assert(loaded.episodes[0].characters[0].isEnsemble && activeEnsembleAppearanceTemplate(loaded.globalConfig).content === '自定义群像模板\n保留换行', 'IndexedDB dropped ensemble settings')
    assert(JSON.stringify(loaded.globalConfig.prompt.ensembleAppearanceTemplates) === JSON.stringify(state.globalConfig.prompt.ensembleAppearanceTemplates), 'IndexedDB dropped template schemes')
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const imported = assembleDataFiles(files, state)
    assert(imported.episodes[0].characters[0].isEnsemble && activeEnsembleAppearanceTemplate(imported.globalConfig).content === '自定义群像模板\n保留换行', 'JSON or WebDAV dropped ensemble settings')
    repository.close()
  })
  await test('Old single templates migrate without changing content, including an intentionally empty template', () => {
    const legacyConfig = JSON.parse(JSON.stringify(config))
    delete legacyConfig.prompt.ensembleAppearanceTemplates
    delete legacyConfig.prompt.activeEnsembleAppearanceTemplateId
    for (const content of ['旧模板\n保留内容', '']) {
      legacyConfig.prompt.ensembleAppearanceTemplate = content
      const migrated = normalizeGlobalConfig(legacyConfig)!
      assert(activeEnsembleAppearanceTemplate(migrated).content === content, 'legacy content changed')
      assert(activeEnsembleAppearanceTemplate(migrated).name === '默认模板', 'legacy default scheme missing')
    }
    delete legacyConfig.prompt.ensembleAppearanceTemplate
    assert(activeEnsembleAppearanceTemplate(normalizeGlobalConfig(legacyConfig)!).content.length > 0, 'missing legacy template has no default')
  })
  await test('Template schemes validate at loading and merge without replacing local selection or content', () => {
    const local = cloneGlobalConfig(config)
    const remote = cloneGlobalConfig(config)
    local.prompt.ensembleAppearanceTemplates[0].content = '本地模板'
    remote.prompt.ensembleAppearanceTemplates[0].content = '远端同名模板'
    remote.prompt.ensembleAppearanceTemplates.push({ id: 'remote-template', name: '远端模板', content: '另一个模板' })
    remote.prompt.activeEnsembleAppearanceTemplateId = 'remote-template'
    const merged = mergeGlobalConfigs(local, remote)
    assert(activeEnsembleAppearanceTemplate(merged).content === '本地模板', 'merge changed local selection or content')
    assert(merged.prompt.ensembleAppearanceTemplates.length === 2, 'merge omitted new template')
    remote.prompt.activeEnsembleAppearanceTemplateId = 'missing'
    assert(normalizeGlobalConfig(remote)!.prompt.activeEnsembleAppearanceTemplateId === remote.prompt.ensembleAppearanceTemplates[0].id, 'missing active ID did not select first template')
    remote.prompt.ensembleAppearanceTemplates[1].name = remote.prompt.ensembleAppearanceTemplates[0].name
    assert(normalizeGlobalConfig(remote) === null, 'duplicate names accepted')
    remote.prompt.ensembleAppearanceTemplates = []
    assert(normalizeGlobalConfig(remote) === null, 'empty template list accepted')
  })
  await test('New characters default to an empty optional voice description', async () => {
    assert(createCharacterAsset('程鹏').voiceDescription === '', 'new voice field must be empty')
  })
  await test('Legacy strings and objects receive empty descriptions; valid descriptions survive normalization', async () => {
    const characters = normalizeCharacterAssets(['旧角色', { name: '旧对象', appearanceDescription: '西装' }, { name: '无效类型', voiceDescription: 42 }, createCharacterAsset('程鹏', '', '浑厚音')])
    assert(characters.slice(0, 3).every(character => character.voiceDescription === ''), 'legacy or invalid field was not normalized')
    assert(characters[1].appearanceDescription === '西装' && characters[3].voiceDescription === '浑厚音', 'other descriptions lost')
  })
  await test('Enabled voice renders the requested wording in character settings and the full prompt', async () => {
    const state = fixture()
    const episode = state.episodes[0]
    const text = '程鹏的妆造是@，音色是@，20岁男性浑厚音。'
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === text, 'voice description placement incorrect')
    assert(composePrompt(config, episode.shots[0], undefined, undefined, episode.characters).includes('程鹏的妆造是 [程鹏.png] ，音色是 [程鹏.mp3] ，20岁男性浑厚音。'), 'full prompt omitted named references or description')
  })
  await test('Appearance, voice description and shot status retain their order', async () => {
    const state = fixture()
    const episode = state.episodes[0]
    episode.characters[0].appearanceDescription = '身穿西装'
    episode.characters[0].appearanceDescriptionEnabled = true
    episode.shots[0].characters[0].statusText = '坐在椅子上'
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === '程鹏的妆造是@，身穿西装，音色是@，20岁男性浑厚音，坐在椅子上。', 'description ordering changed')
  })
  await test('Disabled voice omits its description; empty descriptions retain legacy rendering', async () => {
    const state = fixture()
    const episode = state.episodes[0]
    episode.shots[0].characters[0].includeVoice = false
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === '程鹏的妆造是@。', 'disabled voice description leaked into prompt')
    episode.shots[0].characters[0].includeVoice = true
    episode.characters[0].voiceDescription = '   '
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === '程鹏的妆造是@，音色是@。', 'empty description changed legacy prompt')
  })
  await test('Voice descriptions are opt-in without disabling voice references or clearing text', () => {
    const state = fixture(), episode = state.episodes[0], asset = episode.characters[0]
    assert(!createCharacterAsset('程鹏', '', '已有文字').voiceDescriptionEnabled, 'new descriptions enabled by default')
    asset.voiceDescriptionEnabled = false
    assert(composeCharacterSettings(episode.shots[0], episode.characters) === '程鹏的妆造是@，音色是@。', 'disabled description rendered or voice reference removed')
    const output = composePrompt(config, episode.shots[0], undefined, undefined, episode.characters)
    assert(output.includes('[程鹏.mp3]') && !output.includes('20岁男性浑厚音'), 'full prompt did not respect description switch')
    assert(asset.voiceDescription === '20岁男性浑厚音', 'disabling cleared text')
    const legacy = JSON.parse(JSON.stringify(state))
    delete legacy.episodes[0].characters[0].voiceDescriptionEnabled
    const restored = normalizeAppState(legacy, config).episodes[0].characters[0]
    assert(!restored.voiceDescriptionEnabled && restored.voiceDescription === asset.voiceDescription, 'legacy normalization enabled or cleared description')
  })
  await test('Local storage and normalized JSON preserve voice descriptions', async () => {
    const state = fixture()
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    assert((await repository.load(config)).episodes[0].characters[0].voiceDescription === '20岁男性浑厚音', 'local storage dropped voice description')
    assert((await repository.load(config)).episodes[0].characters[0].voiceDescriptionEnabled, 'local storage dropped voice switch')
    const normalized = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    assert(normalized.episodes[0].characters[0].voiceDescription === '20岁男性浑厚音', 'JSON normalization dropped voice description')
    assert(normalized.episodes[0].characters[0].voiceDescriptionEnabled, 'JSON normalization dropped voice switch')
  })
  await test('WebDAV data files validate and round-trip voice descriptions', async () => {
    const state = fixture()
    const files = buildDataFiles(state)
    const file = files.get('ungrouped.json')!
    parseDataFile(JSON.stringify(file), 'ungrouped.json')
    assert(assembleDataFiles(files, state).episodes[0].characters[0].voiceDescription === '20岁男性浑厚音', 'data-file roundtrip dropped description')
    assert(assembleDataFiles(files, state).episodes[0].characters[0].voiceDescriptionEnabled, 'data-file roundtrip dropped voice switch')
    const invalid = JSON.parse(JSON.stringify(file))
    invalid.episodes[0].characters[0].voiceDescription = 42
    let rejected = false
    try { parseDataFile(JSON.stringify(invalid), 'ungrouped.json') } catch { rejected = true }
    assert(rejected, 'invalid voice description type was accepted')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
