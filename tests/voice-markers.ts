import { normalizeGlobalConfig } from '../src/config'
import { createCharacterAsset, createCharacterConfig, createShot } from '../src/defaults'
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
    shot.text = '【【房间全景】】\n程鹏OS（情绪坚定）：别动！\n手机VO：收到。\nVO（兴奋）：开始！'
    const original = shot.text
    const profile = config.prompt.profiles.find((profile) => profile.id === config.prompt.activeProfileId)!
    profile.shotPrefix = '分镜前缀'
    const result = composePrompt(config, shot, undefined, 12)
    assert(result.includes('00-01秒（景别只能使用远景）\n房间全景\n\n01-12秒（景别不限）\n分镜前缀'), 'first-frame or prefix changed')
    assert(result.endsWith(formatShotDetailText(original).replace('【【房间全景】】\n', '')), 'full prompt differs from direct formatter')
    assert(!result.includes('内心OS音') && shot.text === original, 'legacy instruction or source mutation')
  })
  test('Standalone detail equals the full prompt section with the chosen profile and first-frame timing', () => {
    const shot = createShot()
    shot.text = '【【房间全景】】\n程鹏OS：别动。\n手机VO：收到。'
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
  test('Full prompt resolves position, appearance and voice references while retaining unrelated at signs', () => {
    const shot = createShot()
    shot.characters = [createCharacterConfig('温妤', true)]
    shot.text = 'AAA@，BBB。\nCCC，[DDD]。\n温妤OS（坚定）：继续。\n温妤VO：回应。\n温妤手机VO：收到。\nVO：旁白。\n手机VO：未知来电。'
    const assets = [createCharacterAsset('温妤')]
    const profile = config.prompt.profiles[0]
    profile.basePrefix = '自填@与[预设]。'
    const original = shot.text
    const full = composePrompt(config, shot, profile.id, 12, assets, '20-6')
    assert(full.includes('多角色位置参考 [20-6.png] （仅参考图中角色'), 'position reference not resolved')
    assert(full.includes('温妤的妆造是 [温妤.png] ，音色是 [温妤.mp3] 。'), 'character references wrong')
    assert(full.includes('温妤OS（坚定，嘴巴紧闭，音色参考 [温妤.mp3] ）'), 'OS voice not resolved')
    assert(full.includes('温妤VO（音色参考 [温妤.mp3] ）') && full.includes('温妤手机传来的VO（音色参考 [温妤.mp3] ）'), 'named VO or phone voice not resolved')
    assert(full.includes('\nVO（音色参考@）：旁白。') && full.includes('\n手机传来的VO（音色参考@）：未知来电。'), 'unknown speaker was inferred')
    assert(full.includes('AAA@，BBB。') && full.includes('自填@与 [预设.png] 。'), 'unrelated at signs changed')
    assert(full.includes('CCC，DDD [DDD.png] 。'), 'manual brackets not expanded and spaced')
    assert(full.endsWith(`三、分镜详情\n${composeShotDetail(config, shot, profile.id, 12, assets)}`), 'detail copy and full prompt differ')
    assert(shot.text === original, 'source mutated')
  })
  test('Reference spacing preserves existing spaces and line breaks without accumulating spaces', () => {
    const shot = createShot()
    const profile = config.prompt.profiles[0]
    profile.shotPrefix = ''
    shot.text = 'A[X]， [Y] 。\n[Z]\n[U][V]'
    const result = composeShotDetail(config, shot, profile.id)
    assert(result === 'AX [X.png] ， Y [Y.png] 。\nZ [Z.png] \nU [U.png] V [V.png] ', `spacing wrong: ${JSON.stringify(result)}`)
    assert(composeShotDetail(config, shot, profile.id) === result, 'spacing accumulates across renders')
    shot.text = '温妤\nOS：独立。\nVO：旁白。'
    assert(composeShotDetail(config, shot, profile.id, 12, [createCharacterAsset('温妤')]).includes('OS（嘴巴紧闭，音色参考@）'), 'speaker leaked across lines')
  })
  test('First-frame placeholders use the same shot reference as positioning and standalone detail copy', () => {
    const shot = createShot()
    shot.firstFrameMode = true
    const profile = config.prompt.profiles[0]
    profile.shotPrefix = ''
    for (const text of ['VO：旁白。', '【【 】】\nVO：旁白。', '【【@】】\nVO：旁白。', '【【未闭合']) {
      shot.text = text
      const full = composePrompt(config, shot, profile.id, 8, [], '20-6')
      const detail = composeShotDetail(config, shot, profile.id, 8, [], '20-6')
      assert(full.includes('多角色位置参考 [20-6.png] '), 'position reference wrong')
      assert(detail.startsWith('00-01秒（景别只能使用远景）\n [20-6.png] \n\n01-8秒（景别不限）'), 'first-frame placeholder not resolved')
      assert(full.endsWith(`三、分镜详情\n${detail}`), 'detail copy differs from full prompt')
      assert(shot.text === text, 'source changed')
    }
    shot.text = '【【自定义首帧@】】\n正文@'
    assert(composeShotDetail(config, shot, profile.id, 8, [], '20-6').includes('自定义首帧@'), 'custom first-frame content changed')
    shot.firstFrameMode = false
    assert(composeShotDetail(config, shot, profile.id, 8, [], '20-6') === '正文@', 'disabled first-frame mode did not remove comments or changed raw at signs')
  })
  test('Possessive manual references shorten only the visible name in both reference modes', () => {
    const local = structuredClone(config)
    const profile = local.prompt.profiles[0]
    profile.shotPrefix = ''
    const shot = createShot()
    const examples = [
      ['[aa的bb]', 'bb [aa的bb.png] '],
      ['[林晚的红色的包]', '包 [林晚的红色的包.png] '],
      ['[林晚的手表.png]', '手表 [林晚的手表.png] '],
      ['[林晚的声音.mp3]', '声音 [林晚的声音.mp3] '],
      ['[林晚的声音.]', '声音 [林晚的声音.mp3] '],
      ['音色参考[林晚的声音]', '音色参考声音 [林晚的声音.mp3] '],
      ['音色是 [林晚的声音.MP3]', '音色是 声音 [林晚的声音.MP3] '],
      ['AA[林晚的手表]，DD。', 'AA手表 [林晚的手表.png] ，DD。'],
      ['[ aa 的 bb ]', 'bb [aa 的 bb.png] '],
    ]
    for (const mode of ['basic', 'detailed'] as const) {
      for (const [text, expected] of examples) {
        shot.text = text
        const detail = composeShotDetail(local, shot, profile.id, 8, [], undefined, mode)
        assert(detail === expected, `${mode} ${text}: ${JSON.stringify(detail)}`)
        assert(composePrompt(local, shot, profile.id, 8, [], undefined, mode).endsWith(`三、分镜详情\n${detail}`), 'full and detail outputs differ')
        assert(shot.text === text, 'source text changed')
        assert(composeShotDetail(local, shot, profile.id, 8, [], undefined, mode) === detail, 'repeated rendering changed output')
      }
    }
  })
  test('Other names and multiple references keep existing expansion and spacing rules', () => {
    const local = structuredClone(config)
    const profile = local.prompt.profiles[0]
    profile.shotPrefix = ''
    const shot = createShot()
    shot.text = '[手表][林晚的包]\n[的包]，[林晚的]，[林晚的.png]，[ ]'
    assert(composeShotDetail(local, shot, profile.id) === '手表 [手表.png] 包 [林晚的包.png] \n的包 [的包.png] ，林晚的 [林晚的.png] ，林晚的.png [林晚的.png] ， [ ] ', 'ordinary or incomplete possessive names changed')
  })
  test('First-frame manual references shorten while comments remain excluded', () => {
    const local = structuredClone(config)
    const profile = local.prompt.profiles[0]
    profile.shotPrefix = ''
    const shot = createShot()
    shot.text = '【【[林晚的首帧图]】】\n[林晚的包]【【[林晚的注释]】】'
    shot.firstFrameMode = true
    const detail = composeShotDetail(local, shot, profile.id, 8)
    assert(detail.includes('首帧图 [林晚的首帧图.png] ') && detail.endsWith('包 [林晚的包.png] '), 'first-frame references not shortened')
    assert(!detail.includes('注释'), 'comment leaked into output')
    shot.firstFrameMode = false
    assert(composeShotDetail(local, shot, profile.id) === '包 [林晚的包.png] ', 'inactive first-frame block not excluded')
  })
  test('Automatic references and manual references outside shot text remain unchanged', () => {
    const local = structuredClone(config)
    const profile = local.prompt.profiles[0]
    profile.basePrefix = '全局 [剧组的背景]'
    profile.shotPrefix = '前缀 [剧组的前缀]'
    const shot = createShot()
    shot.characters = [{ ...createCharacterConfig('林晚的妈妈', true), statusText: '[林晚的状态]' }]
    shot.scenes[0].name = '医院'
    shot.scenes[0].statusText = '[林晚的场景]'
    shot.text = '[林晚的包]'
    const asset = createCharacterAsset('林晚的妈妈', '[林晚的手表]', '[林晚的声音]')
    asset.appearanceDescriptionEnabled = true
    asset.voiceDescriptionEnabled = true
    const full = composePrompt(local, shot, profile.id, 8, [asset], '1-1-1', 'detailed')
    assert(full.includes('全局 [剧组的背景.png] ') && full.includes('前缀 [剧组的前缀.png] '), 'global profile references changed')
    assert(full.includes('林晚的妈妈的妆造是 [林晚的妈妈.png] '), 'automatic appearance reference changed')
    for (const name of ['手表', '声音', '状态', '场景']) {
      assert(full.includes(` [林晚的${name}.png] `) && !full.includes(`${name} [林晚的${name}.png] `), `reference outside shot text changed: ${name}`)
    }
    assert(full.endsWith('包 [林晚的包.png] '), 'shot text reference not simplified')
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
