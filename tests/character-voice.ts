import { normalizeGlobalConfig } from '../src/config'
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
    state.globalConfig.prompt.ensembleAppearanceTemplate = '自定义群像模板\n保留换行'
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    const loaded = await repository.load(config)
    assert(loaded.episodes[0].characters[0].isEnsemble && loaded.globalConfig.prompt.ensembleAppearanceTemplate === state.globalConfig.prompt.ensembleAppearanceTemplate, 'IndexedDB dropped ensemble settings')
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const imported = assembleDataFiles(files, state)
    assert(imported.episodes[0].characters[0].isEnsemble && imported.globalConfig.prompt.ensembleAppearanceTemplate === state.globalConfig.prompt.ensembleAppearanceTemplate, 'JSON or WebDAV dropped ensemble settings')
    const legacyConfig = JSON.parse(JSON.stringify(config))
    delete legacyConfig.prompt.ensembleAppearanceTemplate
    assert(normalizeGlobalConfig(legacyConfig)!.prompt.ensembleAppearanceTemplate.length > 0, 'legacy config has no usable template')
    repository.close()
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
  await test('Local storage and normalized JSON preserve voice descriptions', async () => {
    const state = fixture()
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    assert((await repository.load(config)).episodes[0].characters[0].voiceDescription === '20岁男性浑厚音', 'local storage dropped voice description')
    const normalized = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    assert(normalized.episodes[0].characters[0].voiceDescription === '20岁男性浑厚音', 'JSON normalization dropped voice description')
  })
  await test('WebDAV data files validate and round-trip voice descriptions', async () => {
    const state = fixture()
    const files = buildDataFiles(state)
    const file = files.get('ungrouped.json')!
    parseDataFile(JSON.stringify(file), 'ungrouped.json')
    assert(assembleDataFiles(files, state).episodes[0].characters[0].voiceDescription === '20岁男性浑厚音', 'data-file roundtrip dropped description')
    const invalid = JSON.parse(JSON.stringify(file))
    invalid.episodes[0].characters[0].voiceDescription = 42
    let rejected = false
    try { parseDataFile(JSON.stringify(invalid), 'ungrouped.json') } catch { rejected = true }
    assert(rejected, 'invalid voice description type was accepted')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
