import { normalizeGlobalConfig } from '../src/config'
import { createCharacterAsset, createCharacterConfig, createEpisode, createEpisodeGroup, createInitialState, createShot } from '../src/defaults'
import { characterAvailableInUnit, compareCharacterAssets, episodeCharacterUnits, extendCharacterScopes, initializeCharacterScopes, mapCharacterUnitReferences, pruneCharacterScopes, referencedCharacterNames } from '../src/characterScopes'
import { initializeSharedCharacters } from '../src/sharedCharacters'
import { normalizeAppState } from '../src/stateNormalization'
import { assembleDataFiles, buildDataFiles, parseDataFile } from '../src/dataFiles'

export async function runCharacterScopeTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
  const fixture = () => {
    const state = createInitialState(config), group = createEpisodeGroup(config.prompt.activeProfileId)
    const first = createEpisode(11), second = createEpisode(12), separate = createEpisode(13)
    first.groupId = second.groupId = group.id
    first.shots = [createShot(1), createShot(2)]
    second.shots = [createShot(1), createShot(2)]
    const asset = createCharacterAsset('林晚'), unused = createCharacterAsset('配角')
    group.characters = [asset, unused]
    first.shots[0].characters = [{ ...createCharacterConfig(asset.name), characterId: asset.id }]
    second.shots[1].characters = [{ ...createCharacterConfig(asset.name), characterId: asset.id }]
    state.episodeGroups = [group]; state.episodes = [first, second, separate]; state.activeEpisodeId = first.id
    return { state, group, first, second, separate, asset, unused }
  }
  const test = (name: string, run: (data: ReturnType<typeof fixture>) => void) => {
    try { run(fixture()); results.push({ name, passed: true }) } catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  test('new roles are ordinary with an explicitly empty scope', ({ asset }) => {
    assert(!asset.isMain && !asset.isEnsemble && asset.availableUnits?.length === 0, 'defaults wrong')
  })
  test('legacy scopes use every unit of all used episodes', ({ state, asset, unused, first, second }) => {
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.episodeGroups[0].characters.forEach((item: Record<string, unknown>) => { delete item.availableUnits; delete item.isMain })
    const loaded = normalizeAppState(snapshot, config), assets = loaded.episodeGroups[0].characters!
    assert(assets[0].availableUnits?.length === 4 && assets[0].availableUnits.some(unit => unit.episodeId === first.id && unit.unitNumber === 2), 'used episode not fully covered')
    assert(assets[1].availableUnits === null, 'unused role was prematurely initialized')
    initializeSharedCharacters(loaded, loaded.episodes.find(episode => episode.id === second.id)!)
    assert(assets[1].availableUnits?.length === 2 && assets[1].availableUnits.every(unit => unit.episodeId === second.id), 'first managed episode not used')
  })
  test('explicitly cleared scopes stay empty through load and management', ({ state, first }) => {
    const loaded = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    initializeSharedCharacters(loaded, loaded.episodes[0])
    assert(loaded.episodeGroups[0].characters![0].availableUnits?.length === 0, 'existing usage restored cleared scope')
    assert(!characterAvailableInUnit(loaded.episodeGroups[0].characters![0], first.id, 1), 'empty scope permits adding')
  })
  test('legacy manual role references count as used episodes', ({ state, unused, second }) => {
    unused.availableUnits = null
    second.shots[0].text = '[配角.png]'
    initializeCharacterScopes(state, state.episodes[0], [unused])
    assert(unused.availableUnits?.length === 2 && unused.availableUnits.every(unit => unit.episodeId === second.id), 'manual references ignored in migration')
  })
  test('main roles cover new units while preserving their manual scope', ({ state, asset, first, second }) => {
    asset.availableUnits = [{ episodeId: first.id, unitNumber: 1 }]; asset.isMain = true
    second.shots.push(createShot(3))
    assert(characterAvailableInUnit(asset, second.id, 3), 'main role misses new unit')
    asset.isMain = false
    assert(characterAvailableInUnit(asset, first.id, 1) && !characterAvailableInUnit(asset, second.id, 3), 'manual range lost')
  })
  test('scope matches episode ID and unit rather than displayed episode numbers', ({ asset, first, second }) => {
    asset.availableUnits = [{ episodeId: first.id, unitNumber: 2 }]
    first.title = '第 99 集'
    assert(characterAvailableInUnit(asset, first.id, 2) && !characterAvailableInUnit(asset, first.id, 1) && !characterAvailableInUnit(asset, second.id, 2), 'wrong range match')
  })
  test('type sorting precedes pinyin and Latin name sorting', () => {
    const roles = ['普通B', '普通A', '张主角', '杨主角', '乙群像', '甲群像'].map(name => createCharacterAsset(name))
    roles[2].isMain = roles[3].isMain = true; roles[4].isEnsemble = roles[5].isEnsemble = true
    assert(roles.sort(compareCharacterAssets).map(role => role.name).join(',') === '杨主角,张主角,普通A,普通B,甲群像,乙群像', 'sort order wrong')
  })
  test('type precedes reference status and reference status precedes names', () => {
    const roles = ['普通A', '普通Z', '主角A', '主角Z', '群像A', '群像Z'].map(name => createCharacterAsset(name))
    roles[2].isMain = roles[3].isMain = true
    roles[4].isEnsemble = roles[5].isEnsemble = true
    const used = new Set(['普通Z', '主角Z', '群像Z'])
    const sorted = [...roles].sort((a, b) => compareCharacterAssets(a, b, used))
    assert(sorted.map(role => role.name).join(',') === '主角Z,主角A,普通Z,普通A,群像Z,群像A', 'sort priorities wrong')
    assert(roles[0].name === '普通A', 'source library reordered')
  })
  test('equal usage preserves alphabetical and natural number ordering', () => {
    const roles = ['Role10', 'Role2', 'Alpha'].map(name => createCharacterAsset(name))
    assert(roles.sort(compareCharacterAssets).map(role => role.name).join(',') === 'Alpha,Role2,Role10', 'name ordering wrong')
  })
  test('reference status uses owning episode configurations and normalized brackets only', ({ first, second }) => {
    first.shots[0].text = '[ 配角.png ] [音色.] [普通.mp3] 仅正文提及'
    first.scriptText = '[原始剧本角色]'
    second.shots[0].text = '[其他集角色]'
    const used = referencedCharacterNames(first)
    assert(used.has('林晚') && used.has('配角') && used.has('音色') && used.has('普通'), 'configured or normalized reference missing')
    assert(!used.has('原始剧本角色') && !used.has('其他集角色') && !used.has('仅正文提及'), 'unrelated content counted as reference')
  })
  test('new use extends scope without restoring deliberately excluded old use', ({ asset, first }) => {
    const candidate = JSON.parse(JSON.stringify(first))
    candidate.shots[1].characters = [createCharacterConfig(asset.name)]
    extendCharacterScopes([asset], candidate, first)
    extendCharacterScopes([asset], candidate, first)
    assert(asset.availableUnits?.length === 1 && asset.availableUnits[0].unitNumber === 2, 'old use restored or duplicate scope')
    assert(first.shots[1].characters.length === 0, 'source episode changed')
  })
  test('moving an episode extends destination role scope for its existing use', ({ asset, first, group }) => {
    const candidate = { ...first, groupId: 'new-group' }
    extendCharacterScopes([asset], candidate, first)
    assert(asset.availableUnits?.some(unit => unit.episodeId === first.id && unit.unitNumber === 1), 'moved usage not selectable')
  })
  test('adding another shot in an excluded existing unit restores that unit', ({ asset, first }) => {
    const candidate = JSON.parse(JSON.stringify(first))
    candidate.shots.push({ ...createShot(1), characters: [createCharacterConfig(asset.name)] })
    extendCharacterScopes([asset], candidate, first)
    assert(asset.availableUnits?.length === 1 && asset.availableUnits[0].unitNumber === 1, 'new shot use in an existing unit ignored')
  })
  test('scope and outfit associations share ID and unit mapping', ({ asset, first, second }) => {
    asset.availableUnits = [{ episodeId: first.id, unitNumber: 2 }]
    asset.outfits = [{ id: 'red', note: '红衣', appearanceDescription: '', appearanceDescriptionEnabled: false, units: [...asset.availableUnits] }]
    mapCharacterUnitReferences(asset, units => units.map(unit => ({ episodeId: second.id, unitNumber: unit.unitNumber + 1 })))
    assert(asset.availableUnits[0].episodeId === second.id && asset.availableUnits[0].unitNumber === 3 && JSON.stringify(asset.availableUnits) === JSON.stringify(asset.outfits[0].units), 'mapping differs')
  })
  test('unit compaction remaps persisted role scopes', ({ state, first, asset }) => {
    first.shots[0].unitNumber = 5; first.shots[1].unitNumber = 8
    asset.availableUnits = [{ episodeId: first.id, unitNumber: 8 }]
    const loaded = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    assert(loaded.episodeGroups[0].characters![0].availableUnits?.[0].unitNumber === 2, 'scope not compacted with shots')
  })
  test('deleted units and moved or foreign episodes leave no stale scope', ({ state, asset, first, second, separate }) => {
    asset.availableUnits = [...episodeCharacterUnits(first), ...episodeCharacterUnits(second), ...episodeCharacterUnits(separate)]
    first.shots.pop(); second.groupId = null
    pruneCharacterScopes(state)
    assert(asset.availableUnits.length === 1 && asset.availableUnits[0].episodeId === first.id && asset.availableUnits[0].unitNumber === 1, 'stale scope remains')
  })
  test('ungrouped legacy roles initialize independently', ({ state, separate, first }) => {
    const asset = createCharacterAsset('林晚'); asset.availableUnits = null; separate.characters = [asset]
    initializeCharacterScopes(state, separate, separate.characters)
    assert(asset.availableUnits?.length === 1 && asset.availableUnits[0].episodeId === separate.id, 'ungrouped role inherited another episode')
  })
  test('JSON and WebDAV preserve flags, explicit emptiness, scope IDs and units', ({ state, asset, unused, first }) => {
    asset.isMain = true; asset.availableUnits = episodeCharacterUnits(first); unused.isEnsemble = true
    const json = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    const files = new Map([...buildDataFiles(json)].map(([path, value]) => [path, parseDataFile(JSON.stringify(value), path)]))
    const loaded = assembleDataFiles(files, json), assets = loaded.episodeGroups[0].characters!
    assert(assets[0].isMain && !assets[0].isEnsemble && assets[0].availableUnits?.[1].episodeId === first.id && assets[0].availableUnits[1].unitNumber === 2, 'main scope lost')
    assert(assets[1].isEnsemble && !assets[1].isMain && assets[1].availableUnits?.length === 0, 'empty scope or ensemble lost')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
