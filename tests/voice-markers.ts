import { normalizeGlobalConfig } from '../src/config'
import { createShot } from '../src/defaults'
import { composePrompt, composeShotDetail, findPhoneVoiceMatches, formatPhoneVoiceText, formatShotDetailText } from '../src/prompt'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runVoiceMarkerTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  function test(name: string, action: () => void) {
    try { action(); results.push({ name, passed: true }) }
    catch (error) { results.push({ name, passed: false, error: String(error) }) }
  }
  const examples = [
    ['角色OS', '角色OS（嘴巴紧闭，音色参考@）'],
    ['角色OS（情绪坚定）', '角色OS（情绪坚定，嘴巴紧闭，音色参考@）'],
    ['VO', 'VO（音色参考@）'],
    ['VO（情绪兴奋）', 'VO（情绪兴奋，音色参考@）'],
    ['手机VO', '手机传来的VO（音色参考@）'],
    ['OS', 'OS（嘴巴紧闭，音色参考@）'],
    ['手机VO（焦急）', '手机传来的VO（焦急，音色参考@）'],
  ]
  test('All five requested mappings, standalone OS and phone emotions render exactly', () => {
    examples.forEach(([source, expected]) => assert(formatShotDetailText(source) === expected, `${source}: ${formatShotDetailText(source)}`))
  })
  test('Lowercase markers, English brackets and empty brackets normalize without changing punctuation', () => {
    assert(formatShotDetailText('程鹏os(情绪坚定)：别动！') === '程鹏OS（情绪坚定，嘴巴紧闭，音色参考@）：别动！', 'OS case or brackets wrong')
    assert(formatShotDetailText('vo(情绪兴奋):来了。') === 'VO（情绪兴奋，音色参考@）:来了。', 'VO case or punctuation wrong')
    assert(formatShotDetailText('手机vO(焦急)') === '手机传来的VO（焦急，音色参考@）', 'phone marker case wrong')
    assert(formatShotDetailText('OS（）\nVO()\n手机VO（ ）') === 'OS（嘴巴紧闭，音色参考@）\nVO（音色参考@）\n手机传来的VO（音色参考@）', 'empty note inserted an extra comma')
  })
  test('Multiple markers and bare markers before whitespace or punctuation render in one pass', () => {
    assert(formatShotDetailText('程鹏OS：别动。\nVO:开始。\n手机VO！\nOS VO，手机VO。') === '程鹏OS（嘴巴紧闭，音色参考@）：别动。\nVO（音色参考@）:开始。\n手机传来的VO（音色参考@）！\nOS（嘴巴紧闭，音色参考@） VO（音色参考@），手机传来的VO（音色参考@）。', 'multiple marker rendering wrong')
  })
  test('Ordinary words, legacy narration and inline Chinese prose stay unchanged', () => {
    const text = 'BIOS COSMOS VOICE EVOLUTION DEVOPS\n内心OS音，不张嘴，音色参考@\n普通OS文字，普通VO文字，手机VOICE。\n程鹏：你好。'
    assert(formatShotDetailText(text) === text, 'ordinary text rewritten')
  })
  test('Unclosed, mismatched, nested or multiline marker brackets stay unchanged', () => {
    for (const marker of ['程鹏OS', 'VO', '手机VO']) {
      for (const suffix of ['（未闭合', '(未闭合', '（情绪坚定)', '(情绪坚定）', '（情绪（坚定））', '(情绪(坚定))', '（情绪\n坚定）', '(情绪\r\n坚定)']) {
        const text = marker + suffix
        assert(formatShotDetailText(text) === text, `malformed brackets changed: ${text}`)
      }
    }
  })
  test('Existing fixed phrases are not duplicated and rendering remains idempotent', () => {
    for (const [source] of examples) {
      const formatted = formatShotDetailText(source)
      assert(formatShotDetailText(formatted) === formatted, `not idempotent: ${source}`)
    }
    assert(formatShotDetailText('OS（情绪坚定，嘴巴紧闭）') === 'OS（情绪坚定，嘴巴紧闭，音色参考@）', 'mouth instruction duplicated')
    assert(formatShotDetailText('OS（情绪坚定，音色参考@）') === 'OS（情绪坚定，音色参考@，嘴巴紧闭）', 'voice instruction duplicated')
    assert(formatShotDetailText('VO（音色参考@）') === 'VO（音色参考@）', 'VO instruction duplicated')
  })
  test('Phone-only formatter stays phone-only and highlight matching remains unchanged', () => {
    assert(formatPhoneVoiceText('OS\nVO\n手机VO（焦急）') === 'OS\nVO\n手机传来的VO（焦急，音色参考@）', 'phone helper modified other markers')
    assert(formatPhoneVoiceText('手机传来的VO（焦急，音色参考@）') === '手机传来的VO（焦急，音色参考@）', 'phone helper not idempotent')
    assert(findPhoneVoiceMatches('手机VO\n手机vo(焦急)\nVO').map((match) => match[0]).join('/') === '手机VO/手机vo(焦急)', 'phone highlight matching changed')
  })
  test('Full prompts reuse rendering with first-frame mode, prefixes and supplied context without mutating source', () => {
    const shot = createShot()
    shot.firstFrameMode = true
    shot.text = '（（房间全景））\n程鹏OS（情绪坚定）：别动！\n手机VO：收到。\nVO（兴奋）：开始！'
    const original = shot.text
    const profile = config.prompt.profiles.find((profile) => profile.id === config.prompt.activeProfileId)!
    profile.shotPrefix = '分镜前缀'
    const result = composePrompt(config, shot, undefined, 12)
    assert(result.includes('00-01秒（景别只能使用远景）\n房间全景\n\n01-12秒（景别不限）\n分镜前缀'), 'first-frame or prefix changed')
    assert(result.endsWith(formatShotDetailText(original).replace('（（房间全景））\n', '')), 'full prompt differs from direct formatter')
    assert(!result.includes('内心OS音') && shot.text === original, 'legacy instruction or source mutation')
  })
  test('Standalone detail equals the full prompt section with the chosen profile and first-frame timing', () => {
    const shot = createShot()
    shot.text = '（（房间全景））\n程鹏OS：别动。\n手机VO：收到。'
    const profile = config.prompt.profiles[1]
    profile.shotPrefix = '专用方案前缀'
    for (const firstFrameMode of [false, true]) {
      shot.firstFrameMode = firstFrameMode
      const detail = composeShotDetail(config, shot, profile.id, 12)
      assert(composePrompt(config, shot, profile.id, 12).endsWith(`三、分镜详情\n${detail}`), 'shared detail differs from full prompt section')
      assert(detail.includes('专用方案前缀') && detail.includes('程鹏OS（嘴巴紧闭，音色参考@）'), 'profile prefix or formatting missing')
      assert(detail.includes('00-01秒') === firstFrameMode, 'first-frame output mismatch')
      assert(!detail.startsWith('三、分镜详情'), 'detail contains section heading')
    }
  })
  test('Empty details and first-frame placeholders use the same composition as the full prompt', () => {
    const shot = createShot()
    const profile = config.prompt.profiles[0]
    profile.shotPrefix = ''
    assert(composeShotDetail(config, shot, profile.id) === '', 'empty detail not empty')
    shot.firstFrameMode = true
    const detail = composeShotDetail(config, shot, profile.id, 8)
    assert(detail === '00-01秒（景别只能使用远景）\n@\n\n01-8秒（景别不限）', 'placeholder composition wrong')
    assert(composePrompt(config, shot, profile.id, 8).endsWith(`三、分镜详情\n${detail}`), 'empty first-frame detail differs')
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
