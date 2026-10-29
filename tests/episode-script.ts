import { normalizeGlobalConfig } from '../src/config'
import { createEpisode, createInitialState, createShot } from '../src/defaults'
import { assembleDataFiles, buildDataFiles, parseDataFile } from '../src/dataFiles'
import { normalizeSplitScriptText } from '../src/episodeScript'
import { normalizeAppState } from '../src/stateNormalization'
import { LocalRepository } from '../src/storage'
import { downloadDataFiles, uploadDataFiles } from '../src/webdavSync'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'
import { MockDav } from './storage-webdav'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runEpisodeScriptTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => void | Promise<void>) {
    try { await action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  await test('New episodes have an original script and an uninitialized split script', () => {
    const episode = createEpisode()
    assert(episode.scriptText === '' && episode.splitScriptText === null, 'unexpected defaults')
    assert(normalizeSplitScriptText(undefined, episode.shots) === null, 'blank placeholder initialized a script')
    assert(episode.extractedDialogueText === null, 'dialogue should start uninitialized')
  })
  await test('Legacy migration preserves original text and derives split text from actual shots', () => {
    const state = createInitialState(config)
    const episode = state.episodes[0]
    episode.scriptText = '原始剧本，与实际分镜不同'
    episode.shots = [
      { ...createShot(), text: '第一镜', remark: '备注', thirtySecondMode: false },
      { ...createShot(3), text: '第二镜', thirtySecondMode: true },
    ]
    delete (episode as Partial<typeof episode>).splitScriptText
    const before = JSON.stringify(episode.shots)
    const migrated = normalizeAppState(state, config).episodes[0]
    assert(migrated.scriptText === episode.scriptText, 'original overwritten')
    assert(migrated.splitScriptText === '--- #备注#\n第一镜\n===\n+++\n第二镜', 'shot fields lost in serialization')
    assert(JSON.stringify(episode.shots) === before, 'migration mutated its input')
  })
  await test('Legacy episodes with only blank shots do not split their original during loading', () => {
    const state = createInitialState(config)
    state.episodes[0].scriptText = '尚未拆分的原始剧本'
    delete (state.episodes[0] as Partial<typeof state.episodes[0]>).splitScriptText
    delete (state.episodes[0] as Partial<typeof state.episodes[0]>).extractedDialogueText
    const migrated = normalizeAppState(state, config).episodes[0]
    assert(migrated.splitScriptText === null && migrated.shots[0].text === '', 'load applied original to shots')
    assert(migrated.extractedDialogueText === null, 'legacy dialogue should start uninitialized')
  })
  await test('Saved split drafts remain independent from confirmed shots and retain exact spacing', () => {
    const state = createInitialState(config)
    const episode = state.episodes[0]
    episode.scriptText = '原始剧本'
    episode.splitScriptText = '\n---\n尚未确认的拆分草稿\n\n'
    episode.shots[0].text = '此前确认的实际分镜'
    const migrated = normalizeAppState(state, config).episodes[0]
    assert(migrated.splitScriptText === episode.splitScriptText, 'draft reformatted or overwritten by actual shots')
    assert(migrated.shots[0].text === episode.shots[0].text && migrated.scriptText === episode.scriptText, 'normalization applied pending draft')
  })
  await test('Intentionally empty split scripts remain empty even with confirmed shots', () => {
    const state = createInitialState(config)
    state.episodes[0].scriptText = '原始剧本'
    state.episodes[0].splitScriptText = ''
    state.episodes[0].shots[0].text = '已确认正文'
    const migrated = normalizeAppState(state, config).episodes[0]
    assert(migrated.splitScriptText === '' && migrated.shots[0].text === '已确认正文', 'empty draft regenerated')
  })
  await test('Data-file JSON validates and retains the optional split field independently', () => {
    const state = createInitialState(config)
    state.episodes[0].scriptText = '原始剧本'
    state.episodes[0].splitScriptText = '---\n拆分草稿'
    state.episodes[0].shots[0].text = '已确认正文'
    state.episodes[0].extractedDialogueText = '\n第一句\n\n第二句\n'
    const files = new Map([...buildDataFiles(state)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const loaded = assembleDataFiles(files, state).episodes[0]
    assert(loaded.scriptText === '原始剧本' && loaded.splitScriptText === '---\n拆分草稿' && loaded.shots[0].text === '已确认正文', 'JSON roundtrip conflated data')
    assert(loaded.extractedDialogueText === '\n第一句\n\n第二句\n', 'JSON lost dialogue line breaks')
    const invalid = JSON.parse(JSON.stringify(files.get('ungrouped.json')))
    invalid.episodes[0].splitScriptText = 42
    let rejected = false
    try { parseDataFile(JSON.stringify(invalid), 'ungrouped.json') } catch { rejected = true }
    assert(rejected, 'invalid split field accepted')
    invalid.episodes[0].splitScriptText = null
    invalid.episodes[0].extractedDialogueText = 42
    rejected = false
    try { parseDataFile(JSON.stringify(invalid), 'ungrouped.json') } catch { rejected = true }
    assert(rejected, 'invalid dialogue field accepted')
  })
  await test('IndexedDB reload retains original, pending split draft, and confirmed shots', async () => {
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    try {
      const state = createInitialState(config)
      state.episodes[0].scriptText = '原始剧本'
      state.episodes[0].splitScriptText = '+++\n拆分草稿'
      state.episodes[0].shots[0].text = '已确认正文'
      state.episodes[0].extractedDialogueText = '\n第一句\n\n第二句\n'
      await repository.save(state)
      let loaded = await repository.load(config)
      assert(loaded.episodes[0].scriptText === '原始剧本' && loaded.episodes[0].splitScriptText === '+++\n拆分草稿' && loaded.episodes[0].shots[0].text === '已确认正文', 'reload applied or lost draft')
      assert(loaded.episodes[0].extractedDialogueText === '\n第一句\n\n第二句\n', 'IndexedDB lost dialogue line breaks')
      loaded.episodes[0].splitScriptText = ''
      await repository.save(loaded)
      loaded = await repository.load(config)
      assert(loaded.episodes[0].splitScriptText === '' && loaded.episodes[0].shots[0].text === '已确认正文', 'empty draft not retained')
    } finally { repository.close() }
  })
  await test('WebDAV roundtrip retains original, pending draft and confirmed shots', async () => {
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    try {
      const state = createInitialState(config)
      state.episodes[0].scriptText = '原始剧本'
      state.episodes[0].splitScriptText = '---\n拆分草稿'
      state.episodes[0].shots[0].text = '已确认正文'
      state.episodes[0].extractedDialogueText = '\n第一句\n\n第二句\n'
      const dav = new MockDav()
      const result = await uploadDataFiles(dav.client(), buildDataFiles(state), {
        repository, identity: 'episode-script-test', confirmOverwrite: async () => true,
        confirmDelete: async () => true, isGroupPresent: () => false,
      })
      assert(result.complete, 'upload failed')
      const downloaded = await downloadDataFiles(dav.client())
      const episode = assembleDataFiles(downloaded.files, state).episodes[0]
      assert(episode.scriptText === '原始剧本' && episode.splitScriptText === '---\n拆分草稿' && episode.shots[0].text === '已确认正文', 'WebDAV conflated script data')
      assert(episode.extractedDialogueText === '\n第一句\n\n第二句\n', 'WebDAV lost dialogue line breaks')
    } finally { repository.close() }
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
