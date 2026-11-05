import { normalizeGlobalConfig } from '../src/config'
import { createEpisode, createEpisodeGroup, createInitialState, createShot } from '../src/defaults'
import { linkedSourceShotIds, neighboringEpisode, visibleShotCards } from '../src/neighborUnits'
import { normalizeAppState } from '../src/stateNormalization'
import { assembleDataFiles, buildDataFiles, parseDataFile } from '../src/dataFiles'

export async function runNeighborUnitTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
  const test = (name: string, run: () => void) => { try { run(); results.push({ name, passed: true }) } catch (error) { results.push({ name, passed: false, error: String(error) }) } }
  const state = createInitialState(config), group = createEpisodeGroup(config.prompt.activeProfileId)
  const previous = createEpisode(4), current = createEpisode(5), next = createEpisode(6)
  state.episodeGroups = [group]
  state.episodes = [previous, current, next]
  state.activeEpisodeId = current.id
  state.episodes.forEach(episode => { episode.groupId = group.id; episode.shots[0].text = episode.title })
  previous.shots = [createShot(1), createShot(2), createShot(2)]
  next.shots = [createShot(1), createShot(1), createShot(2)]
  previous.shots[2].text = '上一集末镜'
  next.shots[0].text = '下一集首镜'
  test('defaults show current episode only', () => {
    assert(!current.showPreviousEpisodeUnit && !current.showNextEpisodeUnit, 'flags not false')
    assert(visibleShotCards(state, current).length === current.shots.length, 'neighbor enabled by default')
  })
  current.showPreviousEpisodeUnit = current.showNextEpisodeUnit = true
  test('whole boundary units retain identity, indices and labels', () => {
    const cards = visibleShotCards(state, current)
    assert(cards.map(card => card.order).join(',') === 'P2,P1,1,N1,N2', 'orders wrong')
    assert(cards[0].shot === previous.shots[1] && cards[0].episode === previous && cards[0].index === 1, 'copied or wrong source context')
  })
  test('strict number matching does not skip gaps', () => {
    previous.title = '第 03 集'
    assert(!neighboringEpisode(state, current, -1).episode, 'skipped missing episode 4')
    previous.title = '第 04 集'
  })
  test('duplicate and foreign group sources are excluded', () => {
    const duplicate = createEpisode(4); duplicate.groupId = group.id; state.episodes.push(duplicate)
    assert(neighboringEpisode(state, current, -1).reason === '来源集号重复', 'ambiguous source chosen')
    duplicate.groupId = null
    assert(neighboringEpisode(state, current, -1).episode === previous, 'foreign source included')
    state.episodes.pop()
  })
  test('episode one never treats an invalid title as episode zero', () => {
    current.title = '第 01 集'; previous.title = '未命名单集'
    assert(neighboringEpisode(state, current, -1).reason === '没有上集', 'invalid title treated as episode zero')
    current.title = '第 05 集'; previous.title = '第 04 集'
  })
  test('ungrouped, invalid number, missing source and no shots', () => {
    current.groupId = null; assert(neighboringEpisode(state, current, -1).reason, 'ungrouped enabled'); current.groupId = group.id
    current.title = '无法识别'; assert(neighboringEpisode(state, current, -1).reason, 'invalid number accepted'); current.title = '第 05 集'
    const shots = next.shots; next.shots = []; assert(neighboringEpisode(state, current, 1).reason === '来源没有分镜', 'empty source accepted'); next.shots = shots
    assert(!neighboringEpisode(state, previous, -1).episode, 'first episode wrapped')
    assert(!neighboringEpisode(state, next, 1).episode, 'last episode wrapped')
  })
  test('all blank source hides but retains stored preference', () => {
    previous.shots[2].text = ''
    assert(!visibleShotCards(state, current).some(card => card.region === 'previous'), 'blank source still displayed')
    assert(current.showPreviousEpisodeUnit, 'blank source cleared flag')
    previous.shots[2].text = '恢复正文'
    assert(visibleShotCards(state, current)[0].region === 'previous', 'restored source not shown')
  })
  test('deleting boundary unit selects new source boundary', () => {
    const shots = previous.shots; previous.shots = [shots[0]]; shots[0].text = '较早单元'
    assert(visibleShotCards(state, current)[0].shot === shots[0], 'boundary not recalculated')
    previous.shots = shots
  })
  test('JSON and WebDAV files preserve preferences and selected reference', () => {
    state.shotViewMode = 'single-expanded'; state.singleExpandedShotId = previous.shots[2].id
    const json = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
    const files = new Map([...buildDataFiles(json)].map(([path, value]) => [path, parseDataFile(JSON.stringify(value), path)]))
    const restored = assembleDataFiles(files, json)
    const episode = restored.episodes.find(episode => episode.id === current.id)!
    assert(episode.showPreviousEpisodeUnit && episode.showNextEpisodeUnit, 'preferences lost')
    assert(restored.singleExpandedShotId === previous.shots[2].id, 'reference selection rejected')
    episode.showPreviousEpisodeUnit = false
    const hidden = normalizeAppState(restored, config)
    assert(hidden.singleExpandedShotId === current.shots[0].id && hidden.shotViewMode === 'single-expanded', 'hidden selection did not return to current first')
  })
  test('legacy preferences default false', () => {
    const legacy = JSON.parse(JSON.stringify(state))
    legacy.episodes.forEach((episode: Record<string, unknown>) => { delete episode.showPreviousEpisodeUnit; delete episode.showNextEpisodeUnit })
    assert(normalizeAppState(legacy, config).episodes.every(episode => !episode.showPreviousEpisodeUnit && !episode.showNextEpisodeUnit), 'legacy flags not false')
  })
  test('saved links mark only actual boundary reference cards', () => {
    const linked = linkedSourceShotIds(state)
    assert(linked.has(previous.shots[1].id) && linked.has(previous.shots[2].id), 'previous boundary not linked')
    assert(linked.has(next.shots[0].id) && linked.has(next.shots[1].id), 'next boundary not linked')
    assert(!linked.has(previous.shots[0].id) && !linked.has(next.shots[2].id) && !linked.has(current.shots[0].id), 'unreferenced cards marked')
    state.activeEpisodeId = previous.id
    assert(linkedSourceShotIds(state).has(previous.shots[2].id), 'switching to source cleared link')
    state.activeEpisodeId = current.id
  })
  test('blank source and changed boundary update linked status', () => {
    const texts = previous.shots.map(shot => shot.text)
    previous.shots.forEach(shot => { shot.text = '' })
    assert(!linkedSourceShotIds(state).has(previous.shots[2].id), 'blank source remains linked')
    previous.shots.forEach((shot, index) => { shot.text = texts[index] })
    previous.shots[2].unitNumber = 3
    const linked = linkedSourceShotIds(state)
    assert(!linked.has(previous.shots[1].id) && linked.has(previous.shots[2].id), 'old boundary remains linked')
    previous.shots[2].unitNumber = 2
  })
  test('linked source selection falls back to first available local card', () => {
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.activeEpisodeId = previous.id
    snapshot.shotViewMode = 'single-expanded'
    snapshot.singleExpandedShotId = previous.shots[2].id
    const restored = normalizeAppState(snapshot, config)
    assert(restored.singleExpandedShotId === previous.shots[0].id, 'linked card remains selected')
    assert(restored.shotViewMode === 'single-expanded', 'accordion preference lost')
  })
  test('all local cards may be linked without disabling accordion preference', () => {
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.activeEpisodeId = next.id
    snapshot.episodes.find((episode: typeof next) => episode.id === next.id).shots.forEach((shot: typeof next.shots[number]) => { shot.unitNumber = 1 })
    snapshot.shotViewMode = 'single-expanded'
    snapshot.singleExpandedShotId = next.shots[0].id
    const restored = normalizeAppState(snapshot, config)
    assert(restored.singleExpandedShotId === null, 'all-linked episode should have no selection')
    assert(restored.shotViewMode === 'single-expanded', 'empty selection reset accordion')
  })
  test('multiple incoming links require all users to release the source', () => {
    previous.showNextEpisodeUnit = true
    next.showPreviousEpisodeUnit = true
    assert(linkedSourceShotIds(state).has(current.shots[0].id), 'incoming references missing')
    previous.showNextEpisodeUnit = false
    assert(linkedSourceShotIds(state).has(current.shots[0].id), 'one unlink released shared source')
    next.showPreviousEpisodeUnit = false
    assert(!linkedSourceShotIds(state).has(current.shots[0].id), 'all unlinked source remains marked')
  })
  test('expanded mode retains numeric selection and reference cards remain selectable', () => {
    const snapshot = JSON.parse(JSON.stringify(state))
    snapshot.shotViewMode = 'expanded'
    snapshot.singleExpandedShotId = previous.shots[2].id
    const restored = normalizeAppState(snapshot, config)
    assert(restored.singleExpandedShotId === previous.shots[2].id, 'reference card was treated like its collapsed source')
    assert(restored.shotViewMode === 'expanded', 'numeric selection enabled accordion')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
