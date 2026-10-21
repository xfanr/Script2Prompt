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
    assert(composePrompt(config, episode.shots[0], undefined, undefined, episode.characters).includes(text), 'full prompt omitted description')
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
