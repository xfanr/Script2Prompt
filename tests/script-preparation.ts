import { normalizeGlobalConfig } from '../src/config'
import {
  createCharacterAsset,
  createCharacterConfig,
  createEpisode,
  createEpisodeGroup,
  createInitialState,
  createShot,
} from '../src/defaults'
import { analyzeScript, createPreparation, normalizePreparation, parseCharacterBiographies, preparationPending, preparationState, scriptTime, setPreparedUnitScript } from '../src/scriptPreparation'
import { organizeScriptText } from '../src/episodeScript'
import { normalizeAppState } from '../src/stateNormalization'
import { buildDataFiles, assembleDataFiles, parseDataFile } from '../src/dataFiles'
import { composePrompt } from '../src/prompt'
import { LocalRepository } from '../src/storage'
import { testDatabaseName } from './indexeddb-helper'
import { MemoryStorage } from './point-ledger'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runScriptPreparationTests() {
  const config = normalizeGlobalConfig(await (await fetch('/config/default-config.json')).json())!
  const results: { name: string; passed: boolean; error?: string }[] = []
  async function test(name: string, action: () => unknown | Promise<unknown>) {
    try {
      await action()
      results.push({ name, passed: true })
    } catch (error) {
      results.push({ name, passed: false, error: String(error) })
    }
  }
  const biographySamples: [string, string[]][] = [
    ['1. 人物小传\n\n苏禾（女主）\\\n沈家二小姐，随母姓。\n\n沈曼曼（女主姐姐）\n沈家大小姐，护短。\n\n王娇（女反）\n寝室长，骄横跋扈。\n\n陆远（男主）\n苏禾的学长。\n\n林夏（女主舍友）\n家境贫寒。\n\n李科（帮凶）\n学生会会长。', ['苏禾', '沈曼曼', '王娇', '陆远', '林夏', '李科']],
    ['宋晚晴 26岁，重生后冷静清醒。\n\n赵哲 28岁，富二代。\n\n何琳琳26岁，宋晚晴闺蜜。\n\n叶知珊 48岁，何琳琳母亲。\n\n宋志扬 28岁，宋晚晴哥哥。\n\n宋父（宋建平） 50岁，偏心儿子。\n\n宋母（王秀兰） 48岁，刻薄势利。', ['宋晚晴', '赵哲', '何琳琳', '叶知珊', '宋志扬', '宋父', '宋母']],
    ['顾晚萤：女主，18岁，顾家长女。\n\n谢家远：男主，少年将军。\n\n沈砚之：男反，镇国公世子。\n\n顾南枝：反派女配，顾家次女。\n\n顾父顾母：偏心父母。', ['顾晚萤', '谢家远', '沈砚之', '顾南枝', '顾父顾母']],
    ['1\\. 沈知夏：离婚返乡的单亲妈妈。30岁左右，身形利落。\n\n2\\. 马三：养殖户，35—40岁。\n\n3\\. 沈小满：六岁的女儿。\n\n4\\. 周桂兰：邻地种植户，45—55岁。\n\n5\\. 樊立泽：前夫。*32—36岁。\n\n6\\. 赵德顺：村主任。\n\n7\\. 钱万山：董事长。\n\n8\\. 钱丽娜：钱万山的女儿。', ['沈知夏', '马三', '沈小满', '周桂兰', '樊立泽', '赵德顺', '钱万山', '钱丽娜']],
    ['## 曲蓉  ·  女主｜43岁｜煎饼店老板\n\n嘴快泼辣，善良有底线。\n\n## 陆栋才 · 男主｜43岁｜董事长\n\n沉稳有担当。\n\n## 陈涛 · 反派｜45岁｜前夫\n\n好面子，自私。\n\n## 赵美芳 · 反派｜36岁、现任妻子\n\n虚荣势利。\n\n## 陈锋 · 反派｜22岁、成年儿子\n\n自私冲动。\n\n## 璐璐 · 反派｜陈锋女友 20岁｜网红\n\n拜金、逐利。\n\n## 周特助 · 配角 33岁｜助理\n\n做事利落。\n\n## 曲母 · 配角 66岁｜母亲\n\n朴实爱女。\n\n## 刘仁德 · 配角 42｜相亲对象\n\n言行粗鲁。\n\n其他功能角色：刘仁亮（负责人）、王经理（知情人）、舅舅、房东、导购、律师、民警。', ['曲蓉', '陆栋才', '陈涛', '赵美芳', '陈锋', '璐璐', '周特助', '曲母', '刘仁德']],
    ['**苏清清（女主，22 岁，穿越女医）**&#x20;\n\n性格：冷静果敢、聪慧通透。\n\n现代医生穿越成侯府假千金。\n\n**祁瑨（男主，25 岁，废太子）**\n\n性格：沉稳隐忍。\n\n**三皇子（幕后反派）**\n\n性格：阴险虚伪。\n\n**李锦欢（女配反派，罪臣之女）**\n\n性格：傲慢善妒。\n\n**沈明珠（女配反派，沈家小姐）**\n\n性格：骄纵跋扈。\n\n**王虎（正派助力，差役头目）**\n\n性格：粗粝直爽。\n\n**霍铮（正派助力，边关将军）**\n\n性格：刚毅重恩。', ['苏清清', '祁瑨', '三皇子', '李锦欢', '沈明珠', '王虎', '霍铮']],
    ['温妤 角色定妆\\\n气质清冷克制，外柔内韧。\n\n温妤 分场景服装\n乘机、住院、事务所六套。\n\n周景叙 角色定妆\n成熟克制的豪门男主气质。\n\n周景叙 分场景服装\n乘机、晚宴、新郎六阶段。\n\n陈叙白 角色定妆\n温润绅士风，可靠守护者。\n\n陈叙白 分场景服装\n商务与婚礼，保持总裁质感。\n\n乔初 角色定妆\n外表甜美，内里算计。\n\n乔初 分场景服装\n甜美装扮，减少首饰。\n\n周母 角色定妆\n豪门主母，端庄强势。', ['温妤', '周景叙', '陈叙白', '乔初', '周母']],
  ]
  for (const [index, [text, expected]] of biographySamples.entries()) {
    await test(`Biography format ${index + 1} recognizes only role headings and merges repeated costume headings`, () => {
      const names = parseCharacterBiographies(text)
      assert(JSON.stringify(names) === JSON.stringify(expected), `expected ${expected.join('/')} but found ${names.join('/')}`)
    })
  }
  await test('Biography import accepts full-width labels, numbering and bare names without importing metadata', () => {
    const names = parseCharacterBiographies('人物简介\n\n（一）角色名：林晚\n年龄：２６岁\n身份：学生\n\n陆远\n\n正直沉稳，多次护在身前。\n\n姓名：林晚')
    assert(names.join('/') === '林晚/陆远', names.join('/'))
    assert(!parseCharacterBiographies('人物小传\n\n性格：冷静\n年龄：26岁\n其他功能角色：房东、律师').length, 'metadata became a role')
  })
  function setup() {
    const state = createInitialState(config),
      group = createEpisodeGroup(config.prompt.activeProfileId),
      role = createCharacterAsset('林晚', '原皮描述')
    role.isMain = true
    role.note = '原皮'
    role.appearanceDescriptionEnabled = true
    group.characters = [role]
    state.episodeGroups = [group]
    state.episodes[0].groupId = group.id
    return { state, group, role }
  }
  const source =
    '第一集\n1-1 日 内 客厅\n人物：林晚\n林晚：你好。\n△林晚坐下。\n1-2 接1-1\n林晚：再见。\n第二集\n2-1 傍晚 外 医院/医院门口\n人物：林晚、护士2名\n林晚：到了。\n助理VO：车在门口。'
  await test('Organizing imported units preserves metadata and original source while syncing all shot bodies', () => {
    const { state, group, role } = setup()
    const text = '第2集\n2-1 日 内 客厅\n人物：林晚\n△林晚坐下。\n林晚:你好......\n--- #备注#\n林晚:再见。\n2-2 夜 外 路口\n△林晚走过来。'
    const batch = analyzeScript(text, state, group.id, [role])
    const original = batch.episodes[0].scriptText
    const unit = batch.episodes[0].units[0]
    const id = unit.shots[0].id
    unit.shots[0].review.note = '保留评分'
    unit.shots[0].characters = [{ ...createCharacterConfig(role.name), characterId: role.id, outfitId: 'original' }]
    for (const episode of batch.episodes) for (const item of episode.units) setPreparedUnitScript(item, organizeScriptText(item.scriptText))
    assert(batch.sourceText === text && batch.episodes[0].scriptText === original, 'original imported script changed')
    assert(batch.episodes[0].units.every(item => !item.scriptText.includes('△') && item.shots.every(shot => !shot.text.includes('△'))), 'not every unit and shot was organized')
    assert(unit.shots.length === 2 && unit.shots[1].remark === '备注' && unit.shots.every(shot => shot.thirtySecondMode), 'split markers or notes were lost')
    assert(unit.shots[0].text.includes('林晚：你好…') && unit.shots[0].id === id && unit.shots[0].review.note === '保留评分' && unit.shots[0].characters[0].outfitId === 'original', 'shot identity or configuration was lost')
    assert(batch.episodes[0].units[1].characters.some(usage => usage.characterId === role.id), 'formatting before recognition lost an action-only role')
  })
  await test('Editing organized unit text retains shot IDs and overrides when a removed split is restored', () => {
    const { state, group } = setup()
    const unit = analyzeScript('第2集\n2-1 日 内 客厅\n林晚：你好。', state, group.id, []).episodes[0].units[0]
    const pool = [...unit.shots]
    setPreparedUnitScript(unit, '第一条\n---\n第二条', pool)
    const secondId = unit.shots[1].id
    unit.shots[1].scenes = [{ id: 'scene-override', name: '医院', time: '白天', space: '室内', statusText: '' }]
    setPreparedUnitScript(unit, '合并内容', pool)
    setPreparedUnitScript(unit, '第一条\n---\n第二条更新', pool)
    assert(unit.shots[1].id === secondId && unit.shots[1].scenes[0].name === '医院' && unit.scriptText.includes('第二条更新'), 'restored split lost its configuration')
  })
  await test('Time synonyms map to the two existing time values', () => {
    for (const text of ['日', '晨', '清晨', '清早', '早晨', '黎明', '破晓', '上午', '中午', '午后', '下午'])
      assert(scriptTime(text) === '白天', text)
    for (const text of ['傍晚', '黄昏', '入夜', '夜', '夜晚', '晚上', '晚间', '深夜', '半夜', '午夜', '凌晨'])
      assert(scriptTime(text) === '深夜', text)
  })
  await test('Batch parsing recognizes chapter styles, multiple scenes and detached cast lists', () => {
    const { state, group, role } = setup(),
      batch = analyzeScript(source, state, group.id, [role])
    assert(batch.episodes.map((ep) => ep.number).join() === '1,2', 'episode boundary')
    assert(batch.episodes[0].units.length === 2 && batch.episodes[1].units.length === 1, 'unit boundary')
    assert(
      batch.episodes[1].units[0].scenes.length === 2 && batch.episodes[1].units[0].defaultSceneKey === null,
      'multiple scenes forced a default',
    )
    assert(batch.characters.find((asset) => asset.name === '护士群像')?.isEnsemble, 'quantity ensemble missing')
    assert(
      batch.episodes[1].units[0].scenes.every((scene) => scene.time === '深夜'),
      'dusk mapping',
    )
  })
  await test('Recognized cast lists populate roles but stay out of unit and shot text', () => {
    const { state, group, role } = setup()
    const text = '第1集\n1-1 日 内 客厅 人物：林晚、护士\n人物：林晚、护士\n 出场人物：司机\n\t角色：助理\n林晚：人物：只是台词，不是名单。\n△护士走近。'
    const batch = analyzeScript(text, state, group.id, [role]), unit = batch.episodes[0].units[0]
    const names = unit.characters.map(usage => batch.characters.find(asset => asset.id === usage.characterId)!.name)
    assert(['林晚', '护士', '司机', '助理'].every(name => names.includes(name)), 'roster roles were lost')
    assert(!batch.characters.some(asset => asset.name === '角色'), 'roster label became a speaking role')
    assert(unit.scriptText === '林晚：人物：只是台词，不是名单。\n△护士走近。', 'cast line remained or dialogue was removed')
    assert(unit.shots[0].text === unit.scriptText, 'initial shot contains cast metadata')
    assert(batch.sourceText === text && batch.episodes[0].scriptText.includes('人物：林晚'), 'original imported script was changed')
  })
  await test('Removing legacy cast metadata preserves unchanged multi-shot configurations', () => {
    const { state, group, role } = setup(), episode = state.episodes[0]
    const text = '第1集\n1-1 日 内 客厅\n人物：林晚\n林晚：你好。\n△林晚坐下。'
    const first = analyzeScript(text, state, group.id, [role]).episodes[0].units[0]
    const { shots, issues, ...unit } = first
    episode.units = [{ ...unit, scriptText: `人物：林晚\n${unit.scriptText}` }]
    episode.scriptText = text
    episode.shots = [createShot(1), createShot(1)]
    episode.shots.forEach(shot => { shot.unitId = unit.id; shot.review.drawCount = 7 })
    episode.shots[0].text = '林晚：你好。'
    episode.shots[1].text = '△林晚坐下。'
    const restored = analyzeScript(text, state, group.id, [role]).episodes[0].units[0]
    assert(restored.shots.length === 2 && restored.shots.every(shot => shot.review.drawCount === 7), 'cast cleanup reset shot configuration')
    assert(restored.shots[0].id === episode.shots[0].id && !restored.scriptText.includes('人物：'), 'identity or cleaned body changed')
  })
  await test('Continuation copies scene data once without merging units', () => {
    const { state, group, role } = setup(),
      batch = analyzeScript(source, state, group.id, [role])
    const [first, second] = batch.episodes[0].units
    assert(second.sourceHeading === '1-2 接1-1' && second.scenes[0].name === '客厅', 'continuation did not inherit')
    first.scenes[0].name = '书房'
    assert(second.scenes[0].name === '客厅', 'continuation remained linked')
  })
  await test('Pasted episodes 26–29 recognize nonbreaking hyphens and trailing Markdown line breaks', () => {
    const { state, group } = setup()
    const text = [
      '第26集', '26‑1 日 内 礼堂大厅', '人物：苏禾、王娇、王母', '王母：这里有二十万。',
      '第27集', '27‑1 日 内 礼堂大厅', '人物：苏禾、王娇、王母、林夏', '苏禾：林夏，是你？',
      '第28集', '28‑1 日 内 礼堂大厅', '人物：苏禾、林夏', '林夏：我在寝室。',
      '第29集', '29‑1 日 内 礼堂大厅', '人物：苏禾、王母', '苏禾：这些钱你留着。',
      '29‑2 夜 内 苏家餐厅', '人物：苏禾、沈父、沈母、沈曼曼', '沈母：禾禾，让你受这么大委屈。',
      '陆远（电话音，VO）：你赶紧看校园热搜！',
    ].join('\\\n')
    const batch = analyzeScript(text, state, group.id, [])
    assert(batch.episodes.map(ep => ep.number).join() === '26,27,28,29', 'chapter headings not recognized')
    assert(batch.episodes.map(ep => ep.units.length).join() === '1,1,1,2', 'scene boundaries not recognized')
    const units = batch.episodes.flatMap(ep => ep.units)
    assert(units.slice(0, 4).every(unit => unit.scenes[0]?.name === '礼堂大厅' && unit.scenes[0].time === '白天' && unit.scenes[0].space === '室内'), 'auditorium metadata missing')
    assert(units[4].scenes[0]?.name === '苏家餐厅' && units[4].scenes[0].time === '深夜', 'night scene missing')
    assert(units.every(unit => unit.defaultSceneKey && !unit.issues.length), 'valid scene remained pending')
    assert(batch.sourceText === text && units[0].sourceHeading === '26‑1 日 内 礼堂大厅', 'original input or hyphen was rewritten')
    assert(!units[0].scriptText.includes('\\'), 'formatting line breaks leaked into the script')
  })
  await test('Numbered scenes without chapter headings and continuation references accept Word dash variants', () => {
    const { state, group } = setup()
    for (const separator of ['-', '－', '‐', '‑', '‒', '–', '—', '−']) {
      const batch = analyzeScript(`26${separator}1 日 内 礼堂大厅\n人物：苏禾\n苏禾：你好。\n26${separator}2 接26${separator}1\n苏禾：继续。\n27${separator}1 夜 内 苏家餐厅\n苏禾：到了。`, state, group.id, [])
      assert(batch.episodes.map(ep => ep.number).join() === '26,27', `fallback episode boundary: ${separator}`)
      assert(batch.episodes[0].units.length === 2 && batch.episodes[0].units[1].scenes[0]?.name === '礼堂大厅', `continuation failed: ${separator}`)
    }
  })
  await test('A flashback may span real episodes while an old episode citation stays inside its owner', () => {
    const { state, group } = setup()
    const batch = analyzeScript(
      '第六集\n6-1 日 内 客厅\n【闪回】\n人物：林晚\n林晚：以前……\n第七集\n7‑1 日 内 医院\n林晚：继续。\n【闪出】\n第八集\n8-1 夜 内 客厅\n【闪回】\n第七集\n林晚：记得吗？\n【闪出】\n林晚：记得。',
      state,
      group.id,
      [],
    )
    assert(batch.episodes.map((ep) => ep.number).join() === '6,7,8', 'flashback incorrectly split episodes')
    assert(batch.episodes[2].units[0].scriptText.includes('第七集'), 'flashback original was removed')
  })
  await test('Header cast, aliases, age notes, voice-only roles and sound effects stay distinct', () => {
    const { state, group } = setup()
    const batch = analyzeScript(
      '第1集\n1-1 医院 夜 内 人物：沈小满（6岁） 章河（助理）\n小满：你好。\n章河：你好。\n系统：任务开始。\nVO：手机铃声。\n△她拿起手机，秘书文字+VO：车来了。',
      state,
      group.id,
      [],
    )
    assert(
      batch.characters.some((asset) => asset.name === '沈小满') && !batch.characters.some((asset) => asset.name.includes('6岁')),
      'age created separate role',
    )
    assert(
      batch.aliases.some((alias) => alias.name === '小满'),
      'alias not proposed',
    )
    assert(batch.episodes[0].units[0].characters.filter((c) => c.voiceOnly).length === 2, 'audio-only recognition')
    assert(!batch.characters.some((asset) => asset.name === 'VO' || asset.name.includes('手机铃声')), 'sound effect became a role')
  })
  await test('New main-role units require one batch confirmation even with a single outfit', () => {
    const { state, group, role } = setup(),
      batch = analyzeScript(source, state, group.id, [role])
    assert(preparationPending(batch).length === 3, 'single main outfit silently inherited')
    assert(state.episodes.length === 1 && state.episodes[0].scriptText === '', 'analysis changed formal episodes')
    for (const ep of batch.episodes)
      for (const unit of ep.units) for (const usage of unit.characters) if (usage.characterId === role.id) usage.outfitId = 'original'
    assert(preparationPending(batch).length === 0, 'batch confirmation failed')
  })
  await test('Existing episodes default to skip, retain shot IDs and reviews when explicitly updated', () => {
    const { state, group, role } = setup(),
      episode = state.episodes[0],
      shot = episode.shots[0]
    shot.text = '林晚：旧正文'
    shot.characters = [{ ...createCharacterConfig('林晚', true), characterId: role.id, statusText: '戴手表' }]
    shot.review.rating = 4
    shot.review.drawCount = 2
    shot.review.note = '保留评分'
    const batch = analyzeScript('第1集\n1-1 日 内 客厅\n人物：林晚\n林晚：新正文。', state, group.id, [role])
    assert(batch.episodes[0].action === 'skip', 'existing episode overwritten by default')
    batch.episodes[0].action = 'update'
    batch.episodes[0].units[0].characters[0].outfitId = 'original'
    const next = preparationState(state, batch, group.id, episode.id)
    assert(
      next.episodes[0].shots[0].id === shot.id &&
        next.episodes[0].shots[0].review.note === '保留评分' &&
        next.episodes[0].shots[0].characters[0].statusText === '戴手表',
      'configured data was lost',
    )
    assert(state.episodes[0].shots[0].text === '林晚：旧正文', 'candidate apply mutated original')
  })
  await test('Unit defaults and per-shot outfit overrides share the same prompt renderer', () => {
    const { state, group, role } = setup()
    role.outfits = [
      { id: 'red', note: '红色礼服', appearanceDescription: '红裙', appearanceDescriptionEnabled: true, units: [] },
      { id: 'blue', note: '休闲装', appearanceDescription: '蓝衣', appearanceDescriptionEnabled: true, units: [] },
    ]
    const batch = analyzeScript('第1集\n1-1 日 内 客厅\n人物：林晚\n林晚：你好。', state, group.id, [role]),
      unit = batch.episodes[0].units[0]
    unit.characters[0].outfitId = 'red'
    unit.shots[0].characters = [{ ...createCharacterConfig('林晚', true), characterId: role.id, outfitId: 'blue' }]
    const next = preparationState(state, batch, group.id, state.episodes[0].id),
      episode = next.episodes[0],
      shot = episode.shots[0]
    const render = () =>
      composePrompt(
        next.globalConfig,
        shot,
        undefined,
        undefined,
        next.episodeGroups[0].characters!,
        '1-1-1',
        'detailed',
        '',
        episode.id,
        episode.units[0].characters,
      )
    assert(render().includes('[林晚（休闲装）.png]') && render().includes('蓝衣'), 'shot override ignored')
    shot.characters[0].outfitId = null
    assert(render().includes('[林晚（红色礼服）.png]'), 'unit default ignored')
    episode.units[0].characters[0].outfitId = 'blue'
    assert(render().includes('[林晚（休闲装）.png]'), 'inheritance did not follow changed default')
  })
  await test('Audio-only roles need no outfit and output voice without appearance', () => {
    const { state, group } = setup(),
      batch = analyzeScript('第1集\n1-1 日 内 客厅\n秘书VO：你好。', state, group.id, [])
    assert(preparationPending(batch).length === 0, 'voice required outfit')
    const next = preparationState(state, batch, group.id, state.episodes[0].id),
      ep = next.episodes[0]
    const output = composePrompt(
      next.globalConfig,
      ep.shots[0],
      undefined,
      undefined,
      next.episodeGroups[0].characters!,
      '1-1-1',
      'detailed',
      '',
      ep.id,
      ep.units[0].characters,
    )
    assert(output.includes('秘书的音色是 [秘书.mp3]') && !output.includes('秘书的妆造'), 'audio-only prompt includes appearance')
  })
  await test('Splitting and reordering units keep existing shot identities and their own reviews', () => {
    const { state, group, role } = setup(),
      initial = analyzeScript(source, state, group.id, [role])
    for (const ep of initial.episodes)
      for (const unit of ep.units) for (const c of unit.characters) if (c.characterId === role.id) c.outfitId = 'original'
    const formal = preparationState(state, initial, group.id, state.episodes[0].id),
      episode = formal.episodes[0]
    episode.shots[0].review.note = '第一单元'
    episode.shots[1].review.note = '第二单元'
    const firstId = episode.shots[0].id,
      secondId = episode.shots[1].id,
      batch = createPreparation(formal, episode),
      units = batch.episodes[0].units
    const extra = {
      ...JSON.parse(JSON.stringify(units[0])),
      id: 'new-unit',
      unitNumber: 2,
      shots: [{ ...createShot(2), text: '林晚：新增片段' }],
    }
    units.splice(1, 0, extra)
    units.forEach((unit, i) => {
      unit.unitNumber = i + 1
    })
    const next = preparationState(formal, batch, group.id, episode.id),
      shots = next.episodes[0].shots
    assert(new Set(shots.map((shot) => shot.id)).size === shots.length, 'a new piece reused another shot ID')
    assert(
      shots[0].id === firstId && shots[0].review.note === '第一单元' && shots[2].id === secondId && shots[2].review.note === '第二单元',
      'review moved to the new unit',
    )
    assert(shots[1].review.note === '', 'new unit inherited the following unit review')
  })
  await test('Renaming a draft role preserves configured shots by role ID and enters the selected episode', () => {
    const { state, group, role } = setup(),
      batch = analyzeScript(source, state, group.id, [role])
    for (const ep of batch.episodes)
      for (const unit of ep.units) for (const c of unit.characters) if (c.characterId === role.id) c.outfitId = 'original'
    const unit = batch.episodes[1].units[0]
    unit.shots[0].characters = [{ ...createCharacterConfig(role.name, true), characterId: role.id, statusText: '戴手表' }]
    batch.characters.find((asset) => asset.id === role.id)!.name = '林晚晚'
    batch.selectedUnitId = unit.id
    const next = preparationState(state, batch, group.id, state.episodes[0].id)
    const character = next.episodes[1].shots[0].characters.find((c) => c.characterId === role.id)!
    assert(character.name === '林晚晚' && character.statusText === '戴手表', 'renaming lost the configured role')
    assert(next.activeEpisodeId === next.episodes[1].id, 'apply entered an unrelated episode')
  })
  await test('Manually added unit roles reach shots even when their name is absent from the text', () => {
    const { state, group } = setup(),
      batch = analyzeScript('第1集\n1-1 日 内 客厅\n△人群走过。', state, group.id, [])
    const role = createCharacterAsset('路人群像')
    batch.characters.push(role)
    batch.episodes[0].units[0].characters.push({ characterId: role.id, voiceOnly: false, outfitId: null, sourceNames: [] })
    const next = preparationState(state, batch, group.id, state.episodes[0].id)
    assert(
      next.episodes[0].shots[0].characters.some((c) => c.characterId === role.id),
      'manual unit role disappeared',
    )
  })
  await test('Merged material review restores legacy script-mode drafts without changing their contents', () => {
    const { state, group, role } = setup()
    const batch = analyzeScript(source, state, group.id, [role])
    assert(batch.materialView === 'unit', 'new draft did not open material review')
    const legacy = { ...JSON.parse(JSON.stringify(batch)), mode: 'script', materialView: 'character' }
    const restored = normalizePreparation(legacy)!
    assert(!('mode' in restored) && restored.materialView === 'character', 'legacy review mode was not merged')
    const shots = normalizePreparation({ ...JSON.parse(JSON.stringify(batch)), mode: 'shots' })!
    assert(shots.materialView === 'shots' && !('mode' in shots), 'old shot workspace did not become a tab')
    assert(JSON.stringify(restored.episodes) === JSON.stringify(batch.episodes), 'mode migration changed unit contents')
  })
  await test('Drafts, units, outfit overrides survive local storage and WebDAV file round trips', async () => {
    const { state, group, role } = setup()
    group.preparation = analyzeScript(source, state, group.id, [role])
    group.preparation.materialView = 'shots'
    group.preparation.episodes[0].units[0].unitNumber = 9
    group.preparation.episodes[0].units[0].shots.forEach(shot => { shot.unitNumber = 9 })
    const repository = new LocalRepository(new MemoryStorage(), testDatabaseName())
    await repository.save(state)
    const loaded = await repository.load(config)
    assert(
      loaded.episodeGroups[0].preparation?.episodes.length === 2 && loaded.episodeGroups[0].preparation?.materialView === 'shots',
      'draft did not reload',
    )
    const files = new Map([...buildDataFiles(loaded)].map(([path, file]) => [path, parseDataFile(JSON.stringify(file), path)]))
    const restored = assembleDataFiles(files, loaded)
    assert(
      restored.episodeGroups[0].preparation?.sourceText === source && restored.episodes[0].scriptText === '',
      'file round trip overwrote formal script',
    )
    const restoredUnit = restored.episodeGroups[0].preparation!.episodes[0].units[0]
    assert(restoredUnit.unitNumber === 9 && restoredUnit.initialNumber === '1-1', 'file round trip lost the initial restore number')
    repository.close()
  })
  await test('Legacy configured shots initialize independent units without changing formal text', () => {
    const { state, group, role } = setup(),
      episode = state.episodes[0]
    episode.shots[0].text = '林晚：原文'
    episode.shots[0].characters = [{ ...createCharacterConfig('林晚'), characterId: role.id }]
    delete (episode as Partial<typeof episode>).units
    const restored = normalizeAppState(state, config),
      unit = restored.episodes[0].units[0]
    assert(unit.scriptText === '林晚：原文' && restored.episodes[0].shots[0].unitId === unit.id, 'legacy unit not initialized')
    const batch = createPreparation(restored, restored.episodes[0])
    assert(batch.episodes[0].units[0].shots[0].id === episode.shots[0].id, 'opening preparation changed shot identity')
  })
  await test('Independent units with no shots remain after loading', () => {
    const { state, group, role } = setup(),
      batch = analyzeScript(source, state, group.id, [role])
    for (const ep of batch.episodes)
      for (const unit of ep.units) for (const c of unit.characters) if (c.characterId === role.id) c.outfitId = 'original'
    const next = preparationState(state, batch, group.id, state.episodes[0].id)
    next.episodes[0].shots = next.episodes[0].shots.filter((shot) => shot.unitNumber === 2)
    const restored = normalizeAppState(next, config)
    assert(
      restored.episodes[0].units.length === 2 && restored.episodes[0].shots[0].unitNumber === 2,
      'empty independent unit was removed or renumbered',
    )
  })
  await test('Deleting all units stays empty when preparation is reopened', () => {
    const { state, group, role } = setup()
    const batch = analyzeScript('第1集\n1-1 日 内 客厅\n林晚：原文。', state, group.id, [role])
    batch.episodes[0].units = []
    const applied = preparationState(state, batch, group.id, state.episodes[0].id)
    const restored = normalizeAppState(applied, config)
    const reopened = createPreparation(restored, restored.episodes[0])
    assert(reopened.episodes[0].units.length === 0 && reopened.selectedUnitId === null, 'blank placeholder recreated a deleted unit')
    assert(restored.episodes[0].scriptText.includes('原文'), 'unit deletion erased the imported original')
  })
  await test('Initial unit numbers survive renumbering, applying and reopening', () => {
    const { state, group } = setup()
    const batch = analyzeScript('第26集\n26-1 日 内 礼堂大厅\n△大门打开。', state, group.id, [])
    const unit = batch.episodes[0].units[0]
    assert(unit.initialNumber === '26-1', 'initial recognition number missing')
    unit.unitNumber = 9
    unit.shots.forEach(shot => { shot.unitNumber = 9 })
    const applied = preparationState(state, batch, group.id, state.episodes[0].id)
    const restored = normalizeAppState(applied, config)
    const episode = restored.episodes.find(ep => ep.id === batch.episodes[0].episodeId)!
    const reopened = createPreparation(restored, episode).episodes.find(ep => ep.episodeId === episode.id)!.units[0]
    assert(reopened.unitNumber === 9 && reopened.initialNumber === '26-1', 'reopening replaced the initial number')
  })
  await test('Old preparation drafts initialize restore numbers and discard the removed confirmation state', () => {
    const { state, group } = setup()
    group.preparation = analyzeScript('第26集\n26-1 日 内 礼堂大厅\n△大门打开。', state, group.id, [])
    const unit = group.preparation.episodes[0].units[0]
    delete (unit as Partial<typeof unit>).initialNumber
    Object.assign(unit, { confirmed: true })
    const restored = normalizeAppState(state, config).episodeGroups[0].preparation!.episodes[0].units[0]
    assert(restored.initialNumber === '26-1' && !('confirmed' in restored), 'old draft migration retained confirmation or lost restore number')
  })
  return { passed: results.filter((result) => result.passed).length, total: results.length, results }
}
