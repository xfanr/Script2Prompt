import { normalizeGlobalConfig, cloneGlobalConfig } from '../src/config'
import { createCharacterConfig, createEpisodeGroup, createInitialState, createShot } from '../src/defaults'
import { composePrompt, formatPromptReferenceName } from '../src/prompt'
import { normalizeAppState } from '../src/stateNormalization'

export async function runReferenceNameTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  function test(name: string, action: () => void) {
    try { action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  function assert(value: boolean, message: string) { if (!value) throw new Error(message) }
  for (const mode of ['basic', 'detailed'] as const) {
    test(mode + ' references', () => {
      const shot = createShot()
      shot.characters = [createCharacterConfig('宋绪', true)]
      shot.text = '道具[徽章]，宋绪OS：你好。'
      const output = composePrompt(config, shot, undefined, 8, [], '10-6', mode, '10-1')
      assert(output.includes(mode === 'basic' ? '宋绪的妆造是@' : '[宋绪.png]'), 'appearance')
      assert(output.includes(mode === 'basic' ? '音色是@' : '[宋绪.mp3]'), 'voice')
      assert(output.includes(mode === 'basic' ? '多角色位置参考@' : '[10-6.png]'), 'position')
      assert(output.includes('[徽章.png]'), 'manual reference')
    })
    test(mode + ' persistence', () => {
      const state = createInitialState(cloneGlobalConfig(config))
      state.globalConfig.prompt.referenceMode = mode
      const group = createEpisodeGroup(config.prompt.activeProfileId)
      group.referenceMode = mode
      state.episodeGroups.push(group)
      const loaded = normalizeAppState(JSON.parse(JSON.stringify(state)), config)
      assert(loaded.globalConfig.prompt.referenceMode === mode && loaded.episodeGroups[0].referenceMode === mode, 'mode roundtrip')
    })
  }
  test('file references and defaults', () => {
    assert(formatPromptReferenceName('角色.') === '角色.mp3', 'voice suffix')
    assert(formatPromptReferenceName('道具') === '道具.png', 'image suffix')
    assert(formatPromptReferenceName('道具.jpg') === '道具.jpg', 'existing suffix')
    assert(config.prompt.referenceMode === 'detailed', 'default config')
    assert(createEpisodeGroup(config.prompt.activeProfileId).referenceMode === 'detailed', 'group default')
  })
  return { passed: results.filter(result => result.passed).length, total: results.length, results }
}
