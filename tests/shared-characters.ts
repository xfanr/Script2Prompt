import { normalizeGlobalConfig } from '../src/config'
import { createCharacterAsset, createCharacterConfig, createEpisode, createEpisodeGroup, createInitialState, createShot } from '../src/defaults'
import { characterAssetsFor, initializeSharedCharacters, characterAppearance, characterUnits, validateCharacterOutfits } from '../src/sharedCharacters'
import { normalizeAppState } from '../src/stateNormalization'
import { buildDataFiles, assembleDataFiles, parseDataFile } from '../src/dataFiles'
import { composePrompt } from '../src/prompt'

export async function runSharedCharacterTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
  const test = (name: string, action: () => void) => {
    try { action(); results.push({ name, passed: true }) } catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const state = createInitialState(config)
  const group = createEpisodeGroup(config.prompt.activeProfileId)
  group.characters = null
  state.episodeGroups = [group]
  const first = createEpisode(11), second = createEpisode(12), separate = createEpisode(13)
  first.groupId = second.groupId = group.id
  first.characters = [createCharacterAsset('林晚', '旧描述')]
  second.characters = [createCharacterAsset('林晚', '当前描述', '音色'), createCharacterAsset('配角')]
  separate.characters = [createCharacterAsset('林晚', '独立描述')]
  first.shots[0].characters = [createCharacterConfig('林晚', true)]
  second.shots[0].characters = [createCharacterConfig('林晚')]
  state.episodes = [first, second, separate]
  state.activeEpisodeId = second.id
  initializeSharedCharacters(state, second)
  const asset = characterAssetsFor(state, second)[0]
  test('current episode wins shared migration', () => {
    assert(asset.appearanceDescription === '当前描述', 'wrong merge winner')
    assert(first.characters.length === 0 && second.characters.length === 0, 'duplicate storage')
    assert(first.shots[0].characters[0].characterId === asset.id && second.shots[0].characters[0].characterId === asset.id, 'missing identity links')
    assert(characterAssetsFor(state, separate)[0].appearanceDescription === '独立描述', 'ungrouped merged')
    assert(characterAssetsFor(state, first).length === 2, 'other episode assets missing')
  })
  asset.outfits = [
    { id: 'red', note: '红色礼服', appearanceDescription: '红裙[珍珠]', units: [{ episodeId: first.id, unitNumber: 1 }] },
    { id: 'white', note: '白衣', appearanceDescription: '白色衣服', units: [{ episodeId: second.id, unitNumber: 1 }] },
  ]
  asset.appearanceDescription = ''
  test('outfit validation and unit sorting', () => {
    assert(characterUnits(state, second, asset).map(unit => unit.label).join(',') === '11-1,12-1', 'units wrong')
    assert(!validateCharacterOutfits(state, second, asset), 'valid outfit rejected')
    asset.outfits[1].note = '红色礼服'
    assert(validateCharacterOutfits(state, second, asset).includes('重复'), 'duplicate notes accepted')
    asset.outfits[1].note = ''
    assert(validateCharacterOutfits(state, second, asset), 'empty note accepted')
    asset.outfits[1].note = '白衣'
    asset.outfits[1].units = []
    assert(validateCharacterOutfits(state, second, asset).includes('12-1'), 'unassigned unit accepted')
    asset.outfits[1].units = [{ episodeId: second.id, unitNumber: 1 }]
  })
  test('prompt uses outfit name and description', () => {
    const detailed = composePrompt(config, first.shots[0], undefined, 8, [asset], '11-1', 'detailed', '11-1', first.id)
    assert(detailed.includes('[林晚（红色礼服）.png]') && detailed.includes('红裙') && detailed.includes('[林晚.mp3]'), 'outfit rendering wrong')
    assert(!detailed.includes('11-1林晚'), 'unit prefix retained')
    const basic = composePrompt(config, first.shots[0], undefined, 8, [asset], '11-1', 'basic', '11-1', first.id)
    assert(basic.includes('林晚的妆造是@') && basic.includes('红裙'), 'basic rendering wrong')
    asset.isEnsemble = true
    assert(!composePrompt(config, first.shots[0], undefined, 8, [asset], '11-1', 'detailed', '11-1', first.id).includes('林晚的妆造'), 'ensemble appearance reference')
    asset.isEnsemble = false
    assert(characterAppearance(asset, second.id, second.shots[0]).description === '白色衣服', 'other unit outfit wrong')
  })
  test('JSON and WebDAV preserve shared identity and outfits', () => {
    const json = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    const files = new Map([...buildDataFiles(json)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const loaded = assembleDataFiles(files, json)
    initializeSharedCharacters(loaded, loaded.episodes[1])
    const restoredEpisode = loaded.episodes.find(episode => episode.id === first.id)!
    const restored = characterAssetsFor(loaded, restoredEpisode)[0]
    assert(restored.id === asset.id && restored.outfits[0].units[0].episodeId === first.id, 'roundtrip lost identifiers')
    assert(restoredEpisode.characters.length === 0 && restored.outfits[0].note === '红色礼服', 'duplicated or lost outfits')
  })
  test('new usage requires assignment', () => {
    const shot = createShot(2)
    shot.characters = [{ ...createCharacterConfig('林晚'), characterId: asset.id }]
    const proposed = { ...state, episodes: state.episodes.map(episode => episode.id === first.id ? { ...episode, shots: [...episode.shots, shot] } : episode) }
    assert(validateCharacterOutfits(proposed, first, asset).includes('11-2'), 'new unit accepted without outfit')
    assert(!validateCharacterOutfits(state, first, asset), 'candidate mutated live usage')
  })
  test('unit compaction keeps outfit associations', () => {
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.episodes[0].shots[0].unitNumber = 5
    snapshot.episodeGroups[0].characters[0].outfits[0].units[0].unitNumber = 5
    const loaded = normalizeAppState(snapshot, config)
    const restored = characterAssetsFor(loaded, loaded.episodes[0])[0]
    assert(restored.outfits[0].units[0].unitNumber === 1, 'outfit unit was not renumbered')
    assert(characterAppearance(restored, loaded.episodes[0].id, loaded.episodes[0].shots[0]).description === '红裙[珍珠]', 'compaction changed appearance')
  })
  test('shared migration preserves shot configuration and stays stable', () => {
    first.shots[0].characters[0].statusText = '手持纸张'
    const original = JSON.stringify(first.shots[0].characters)
    initializeSharedCharacters(state, first)
    assert(JSON.stringify(first.shots[0].characters) === original, 'migration changed shot configuration')
    assert(characterAssetsFor(state, first)[0].id === asset.id, 'migration recreated shared character')
  })
  return { passed: results.filter(item => item.passed).length, total: results.length, results }
}
