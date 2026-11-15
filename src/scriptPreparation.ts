import {
  createCharacterAsset,
  createCharacterConfig,
  createEpisode,
  createId,
  createSceneConfig,
  createShot,
  sceneAssetKey,
} from './defaults'
import { normalizeSplitScriptText, splitBatchShotText } from './episodeScript'
import { detectCharacters } from './prompt'
import { characterAssetsFor, initializeSharedCharacters } from './sharedCharacters'
import { reconcileTimingSegments } from './timing'
import type {
  AppState,
  CharacterAsset,
  Episode,
  EpisodeUnit,
  PreparedEpisode,
  PreparedUnit,
  SceneAsset,
  SceneTime,
  ScriptPreparation,
  Shot,
} from './types'

export function setPreparedUnitScript(unit: PreparedUnit, text: string, pool = unit.shots) {
  unit.scriptText = text
  unit.shots = splitBatchShotText(text).map((segment, index) => {
    const shot = pool[index] ?? createShot(unit.unitNumber)
    shot.text = segment.text
    shot.remark = segment.remark
    shot.thirtySecondMode = true
    shot.unitId = unit.id
    shot.unitNumber = unit.unitNumber
    pool[index] = shot
    return shot
  })
}

export function parseCharacterBiographies(text: string): string[] {
  const lines = text.normalize('NFKC').replace(/\r\n?/g, '\n')
    .replace(/&#(?:x20|32|160);|&nbsp;/gi, ' ').replace(/\\[ \t]*(?=\n|$)/g, '')
    .split('\n').map(line => line.trim());
  const name = "[\\p{Script=Han}A-Za-z][\\p{Script=Han}A-Za-z·・'’\\-]{0,19}";
  const fieldName = new RegExp(`^(?:姓名|角色名|人物姓名|人物名称|男主(?:角)?|女主(?:角)?)\\s*[:：]\\s*(${name})`, 'u');
  const heading = new RegExp(`^(${name})\\s*(?:\\([^)]*\\)|[:：]|[·｜|]|(?=\\d+\\s*(?:岁|周岁|[-—~至]\\s*\\d+\\s*岁))|\\s*(?:角色定妆|分场景服装))`, 'u');
  const bareName = new RegExp(`^(${name})$`, 'u');
  const labels = new Set(['人物小传', '角色小传', '人物简介', '角色简介', '人物介绍', '角色介绍', '人物设定', '角色设定', '人物表', '主要人物', '人物关系', '角色定妆', '分场景服装', '性格', '身份', '年龄', '性别', '职业', '外貌', '形象', '简介', '备注', '背景', '服装', '发型', '音色', '声音', '姓名', '角色名', '人物姓名', '人物名称', '人物', '角色', '出场人物', '其他功能角色', '其他角色', '关系', '标签', '男', '女']);
  const names = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\\([.*#()\-])/g, '$1').replace(/\*\*|__/g, '')
      .replace(/^#{1,6}\s*/, '').replace(/^(?:(?:\d+|[一二三四五六七八九十]+)[.、)]|\((?:\d+|[一二三四五六七八九十]+)\)|[-*•])\s*/, '').trim();
    if (!line || /^其他(?:功能)?(?:人物|角色)/.test(line)) continue;
    const match = line.match(fieldName) ?? line.match(heading);
    let candidate = match?.[1];
    if (!candidate && (i === 0 || !lines[i - 1]) && bareName.test(line)) {
      const description = lines.slice(i + 1).find(next => next);
      if (description && /[，。；：,:;.!?]|\d+\s*岁/.test(description)) candidate = line;
    }
    if (candidate && !labels.has(candidate)) names.add(candidate);
  }
  return [...names];
}

export function scriptNumber(text: string): number {
  const value = text.normalize('NFKC')
  if (/^\d+$/.test(value)) return Number(value)
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  let total = 0,
    digit = 0
  for (const c of value) {
    if (c === '十' || c === '百') {
      total += (digit || 1) * (c === '十' ? 10 : 100)
      digit = 0
    } else if (c in digits) digit = digits[c]
    else return 0
  }
  return total + digit
}

export function scriptTime(text: string): SceneTime {
  return /傍晚|黄昏|入夜|夜|晚|凌晨/.test(text) ? '深夜' : '白天'
}

const timePattern =
  /^(?:白天|白昼|日间|清晨|清早|早晨|黎明|破晓|上午|中午|午后|下午|傍晚|黄昏|入夜|深夜|半夜|午夜|凌晨|夜晚|晚上|晚间|日|夜|晨)(?:[／/](?:日|夜))?$/
const spacePattern = /^(?:室内|室外|内|外)(?:[／/](?:内|外))?$/
const sceneNumberPattern = /^(\d+)\s*[-－‐‑‒–—−]\s*(\d+)\s*(.*)$/

export function parseSceneHeading(heading: string): { scenes: SceneAsset[]; cast: string; continuation: string | null; issues: string[] } {
  const castMatch = heading.match(/(?:出场人物|人物|角色)\s*[:：](.*)$/)
  const cast = castMatch?.[1] ?? ''
  const text = heading.slice(0, castMatch?.index ?? heading.length).trim()
  const continuation = text.match(/^接\s*(\d+)\s*[-－‐‑‒–—−]\s*(\d+)/)
  if (continuation) return { scenes: [], cast, continuation: `${Number(continuation[1])}-${Number(continuation[2])}`, issues: [] }
  const tokens = text
    .replace(/[-－‐‑‒–—−]/g, ' ')
    .split(/[\s，、]+/)
    .filter(Boolean)
  const time = tokens.find((token) => timePattern.test(token))
  const space = tokens.find((token) => spacePattern.test(token))
  const name = tokens
    .filter((token) => token !== time && token !== space)
    .join(' ')
    .trim()
  const issues: string[] = []
  if (!name) issues.push('场景名称待补充')
  if (!time) issues.push('场景时间待核对')
  if (!space || /[／/]/.test(space)) issues.push('室内外待核对')
  if (time && /[／/]/.test(time)) issues.push('场次包含日夜变化，请为分镜核对场景')
  const scenes = name
    .split(/[／/\\]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      time: scriptTime(time ?? ''),
      space: /外/.test(space ?? '') && !/内/.test(space ?? '') ? ('室外' as const) : ('室内' as const),
    }))
  return { scenes, cast, continuation: null, issues }
}

function castNames(text: string) {
  const entries: string[] = []
  let current = '',
    depth = 0
  for (const c of text) {
    if ('（('.includes(c)) depth++
    if ('）)'.includes(c)) depth--
    if (depth === 0 && /[、,，;；\s]/.test(c)) {
      if (current.trim()) entries.push(current.trim())
      current = ''
    } else current += c
  }
  if (current.trim()) entries.push(current.trim())
  return entries
}

function baseName(text: string) {
  return text
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .replace(/^(?:VO|OS)\s*/i, '')
    .replace(/(?:文字\+)?(?:VO|OS)(?:\+画面)?$/i, '')
    .replace(/\s*[*＊×]\s*[Nn\d]+$/, '群像')
    .replace(/(?:\d+|两|几)名$/, '群像')
    .trim()
}

function speaker(line: string, names: string[]) {
  line = line.trimStart()
  const inline = line.match(/([\u4e00-\u9fffA-Za-z0-9]{1,8})文字\+(?:VO|OS)\s*[:：]/i)
  if (inline) line = line.slice(inline.index)
  line = line.replace(/^手机屏幕[，,:：\s]*/, '')
  if (/^[△▲◇◆【\[]/.test(line) || /^(?:人物|出场人物|角色|画面|字幕|闪回|特写|音效|旁白)\s*[:：]/.test(line)) return null
  let depth = 0,
    colon = -1
  for (let i = 0; i < line.length; i++) {
    if ('（(【'.includes(line[i])) depth++
    else if ('）)】'.includes(line[i])) depth--
    else if (depth === 0 && ':：'.includes(line[i])) {
      colon = i
      break
    }
  }
  if (colon < 0 || colon > 55) return null
  const label = line.slice(0, colon).trim()
  if (/^(?:VO|OS)$/i.test(label)) return null
  let name = baseName(label)
  const known = names.filter((n) => label.startsWith(n)).sort((a, b) => b.length - a.length)[0]
  if (known && /(?:vo|os)/i.test(label)) name = known
  if (!name || name.length > 14 || /[，。！？、]/.test(name)) return null
  let remaining = name
  const combined: string[] = []
  for (const n of [...names].sort((a, b) => b.length - a.length))
    if (remaining.includes(n)) {
      combined.push(n)
      remaining = remaining.replace(n, '')
    }
  return {
    names: combined.length > 1 && !remaining ? combined : [name],
    voiceOnly: name === '系统' || (/vo|os/i.test(label) && !/\+画面/.test(label)),
    source: label,
  }
}

export function outfitOptions(asset: CharacterAsset) {
  return asset.outfits.length > 1
    ? asset.outfits
    : [
        {
          id: 'original',
          note: asset.note || '原皮',
          appearanceDescription: asset.appearanceDescription,
          appearanceDescriptionEnabled: asset.appearanceDescriptionEnabled,
          units: [],
        },
      ]
}

export function legacyEpisodeUnits(episode: Episode, assets: CharacterAsset[]): EpisodeUnit[] {
  return [...new Set(episode.shots.map((shot) => shot.unitNumber))].map((unitNumber) => {
    const shots = episode.shots.filter((shot) => shot.unitNumber === unitNumber)
    const scenes = shots
      .flatMap((shot) => shot.scenes.filter((scene) => scene.name.trim()).map(({ name, time, space }) => ({ name, time, space })))
      .filter((scene, i, all) => all.findIndex((item) => sceneAssetKey(item) === sceneAssetKey(scene)) === i)
    const characters = assets
      .filter((asset) => shots.some((shot) => shot.characters.some((c) => c.characterId === asset.id || c.name === asset.name)))
      .map((asset) => ({
        characterId: asset.id,
        voiceOnly: shots.every((shot) =>
          shot.characters.filter((c) => c.characterId === asset.id || c.name === asset.name).every((c) => c.voiceOnly === true),
        ),
        outfitId:
          asset.outfits.length > 1
            ? (asset.outfits.find((outfit) => outfit.units.some((unit) => unit.episodeId === episode.id && unit.unitNumber === unitNumber))
                ?.id ?? null)
            : 'original',
        sourceNames: [asset.name],
      }))
    return {
      id: shots[0]?.unitId || `legacy-unit-${episode.id}-${unitNumber}`,
      unitNumber,
      initialNumber: `${Number(episode.title.match(/\d+/)?.[0] ?? 1)}-${unitNumber}`,
      sourceHeading: '',
      scriptText: shots
        .map((shot) => shot.text)
        .filter(Boolean)
        .join('\n'),
      scenes,
      defaultSceneKey: scenes[0] ? sceneAssetKey(scenes[0]) : null,
      characters,
    }
  })
}

export function normalizeEpisodeUnits(value: unknown, episode: Episode, assets: CharacterAsset[]): EpisodeUnit[] {
  if (!Array.isArray(value) || (!value.length && episode.shots.some((shot) => shot.text.trim()))) return legacyEpisodeUnits(episode, assets)
  return value
    .filter((unit) => unit && typeof unit.id === 'string' && Number.isInteger(unit.unitNumber))
    .map((unit) => ({
      id: unit.id,
      unitNumber: unit.unitNumber,
      initialNumber: typeof unit.initialNumber === 'string' && /^\d+-\d+$/.test(unit.initialNumber) ? unit.initialNumber
        : `${Number(episode.title.match(/\d+/)?.[0] ?? 1)}-${unit.unitNumber}`,
      sourceHeading: typeof unit.sourceHeading === 'string' ? unit.sourceHeading : '',
      scriptText: typeof unit.scriptText === 'string' ? unit.scriptText : '',
      scenes: Array.isArray(unit.scenes)
        ? unit.scenes
            .filter((s: SceneAsset) => s && typeof s.name === 'string')
            .map((s: SceneAsset) => ({
              name: s.name,
              time: scriptTime(s.time),
              space: s.space === '室外' ? '室外' : s.space === '无' ? '无' : '室内',
            }))
        : [],
      defaultSceneKey: typeof unit.defaultSceneKey === 'string' ? unit.defaultSceneKey : null,
      characters: Array.isArray(unit.characters)
        ? unit.characters
            .filter((c: any) => c && typeof c.characterId === 'string')
            .map((c: any) => ({
              characterId: c.characterId,
              voiceOnly: c.voiceOnly === true,
              outfitId: typeof c.outfitId === 'string' ? c.outfitId : null,
              sourceNames: Array.isArray(c.sourceNames) ? c.sourceNames.filter((n: unknown) => typeof n === 'string') : [],
            }))
        : [],
    }))
}

export function normalizePreparation(value: unknown): ScriptPreparation | null {
  if (!value || typeof value !== 'object') return null
  const batch = value as ScriptPreparation
  if (
    typeof batch.sourceText !== 'string' ||
    !Array.isArray(batch.episodes) ||
    !Array.isArray(batch.characters) ||
    !batch.episodes.every(
      (ep) =>
        ep &&
        typeof ep.id === 'string' &&
        typeof ep.episodeId === 'string' &&
        Array.isArray(ep.units) &&
        ep.units.every(
          (u) => u && typeof u.id === 'string' && Array.isArray(u.shots) && Array.isArray(u.characters) && Array.isArray(u.scenes),
        ),
    )
  )
    return null
  batch.aliases = Array.isArray(batch.aliases) ? batch.aliases : []
  const legacy = batch as ScriptPreparation & { mode?: string }
  batch.materialView = legacy.mode === 'shots' || batch.materialView === 'shots' ? 'shots' : batch.materialView === 'character' ? 'character' : 'unit'
  delete legacy.mode
  batch.selectedUnitId = typeof batch.selectedUnitId === 'string' ? batch.selectedUnitId : (batch.episodes[0]?.units[0]?.id ?? null)
  batch.selectedCharacterId = typeof batch.selectedCharacterId === 'string' ? batch.selectedCharacterId : null
  batch.episodes.forEach((ep) => {
    ep.issues ??= []
    ep.units.forEach((u) => {
      u.issues ??= []
      if (typeof u.initialNumber !== 'string' || !/^\d+-\d+$/.test(u.initialNumber)) u.initialNumber = `${ep.number}-${u.unitNumber}`
      delete (u as PreparedUnit & { confirmed?: boolean }).confirmed
    })
  })
  return batch
}

export function createPreparation(state: AppState, episode: Episode): ScriptPreparation {
  initializeSharedCharacters(state, episode)
  const episodes = state.episodes
    .filter((item) => (episode.groupId ? item.groupId === episode.groupId : item.id === episode.id))
    .sort((a, b) => scriptNumber(a.title.match(/\d+/)?.[0] ?? '') - scriptNumber(b.title.match(/\d+/)?.[0] ?? ''))
  const characters: CharacterAsset[] = JSON.parse(JSON.stringify(characterAssetsFor(state, episode)))
  const prepared: PreparedEpisode[] = episodes.map((ep) => ({
    id: createId('prepared-episode'),
    episodeId: ep.id,
    number: Number(ep.title.match(/\d+/)?.[0] ?? 1),
    scriptText: ep.scriptText,
    action: 'update',
    existing: true,
    issues: [],
    units: (ep.units.length || !ep.shots.some(shot => shot.text.trim()) ? ep.units : legacyEpisodeUnits(ep, characters)).map((unit) => ({
      ...JSON.parse(JSON.stringify(unit)),
      shots: JSON.parse(JSON.stringify(ep.shots.filter((shot) => shot.unitNumber === unit.unitNumber))),
      issues: [],
    })),
  }))
  return {
    sourceText: '',
    episodes: prepared,
    characters,
    aliases: [],
    materialView: 'unit',
    selectedUnitId: prepared.find((ep) => ep.episodeId === episode.id)?.units[0]?.id ?? null,
    selectedCharacterId: null,
  }
}

export function analyzeScript(
  sourceText: string,
  state: AppState,
  groupId: string | null,
  seedCharacters: CharacterAsset[],
  fallbackNumber = 1,
): ScriptPreparation {
  const characters: CharacterAsset[] = JSON.parse(JSON.stringify(seedCharacters))
  const aliases: ScriptPreparation['aliases'] = []
  const chunks: { number: number; lines: string[] }[] = []
  let current: { number: number; lines: string[] } | null = null,
    flashback = false
  const prefix: string[] = []
  const sourceLines = sourceText.replace(/\r\n?/g, '\n').replace(/\\[ \t]*(?=\n|$)/g, '').split('\n')
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
    const line = sourceLines[lineIndex]
    if (/【闪出】|【闪回[^】]*结束】/.test(line)) flashback = false
    else if (/【闪回[^】]*】/.test(line)) flashback = true
    const marker = line.trim().match(/^第\s*([\d０-９一二三四五六七八九十百零〇两]+)\s*集(?:\s.*)?$/)
    const following =
      marker && flashback
        ? (sourceLines
            .slice(lineIndex + 1)
            .find((line) => line.trim())
            ?.trim() ?? '')
        : ''
    const forwardScene =
      marker &&
      scriptNumber(marker[1]) > (current?.number ?? 0) &&
      Number(following.match(sceneNumberPattern)?.[1]) === scriptNumber(marker[1])
    if (marker && (!flashback || forwardScene)) {
      current = { number: scriptNumber(marker[1]), lines: [...(chunks.length ? [] : prefix), line] }
      chunks.push(current)
    } else if (current) current.lines.push(line)
    else prefix.push(line)
  }
  if (!chunks.length) {
    for (const line of prefix) {
      const scene = line.trim().match(sceneNumberPattern)
      const number = scene ? Number(scene[1]) : (current?.number ?? fallbackNumber)
      if (!current || (scene && current.number !== number)) {
        current = { number, lines: [] }
        chunks.push(current)
      }
      current.lines.push(line)
    }
  }
  const getAsset = (raw: string) => {
    const name = baseName(raw)
    let asset = characters.find((asset) => asset.name === name)
    if (!asset) {
      asset = createCharacterAsset(name)
      characters.push(asset)
      const candidate = characters.filter((item) => item.id !== asset!.id && name.length >= 2 && item.name.endsWith(name))
      if (candidate.length === 1 && !aliases.some((item) => item.name === name)) aliases.push({ name, targetId: candidate[0].id })
    }
    return asset
  }
  // 人物表先建立候选库，再用对白与动作补充每个单元的使用关系。
  for (const chunk of chunks)
    for (const line of chunk.lines) {
      const cast = line.match(/(?:出场人物|人物|角色)\s*[:：](.*)$/)
      if (cast)
        castNames(cast[1])
          .filter((name) => baseName(name))
          .forEach(getAsset)
    }
  for (const chunk of chunks)
    for (const line of chunk.lines) {
      const speaking = speaker(
        line,
        characters.map((asset) => asset.name),
      )
      if (speaking) speaking.names.forEach(getAsset)
    }
  const episodes: PreparedEpisode[] = chunks.map((chunk) => {
    const existing = state.episodes.find((ep) => ep.groupId === groupId && Number(ep.title.match(/\d+/)?.[0]) === chunk.number)
    const occupied = Boolean(existing && (existing.scriptText.trim() || existing.shots.some((shot) => shot.text.trim())))
    const prepared: PreparedEpisode = {
      id: createId('prepared-episode'),
      episodeId: existing?.id ?? createId('episode'),
      number: chunk.number,
      scriptText: chunk.lines.join('\n').trim(),
      existing: occupied,
      action: occupied ? 'skip' : existing ? 'update' : 'new',
      units: [],
      issues: [],
    }
    let unit: PreparedUnit | null = null,
      intro: string[] = []
    const knownScenes = new Map<string, { scenes: SceneAsset[]; defaultSceneKey: string | null }>()
    for (const original of chunk.lines) {
      const line = original.trim()
      if (/^第\s*[\d０-９一二三四五六七八九十百零〇两]+\s*集/.test(line) && !unit) continue
      const numbered = line.match(sceneNumberPattern)
      const bare = /^(?:日|夜|晨|白天|深夜|傍晚|清晨)[\s-]+(?:内|外|室内|室外)[\s-]+/.test(line)
      if (numbered || bare) {
        const parsed = parseSceneHeading(numbered?.[3] ?? line)
        const old = existing?.units.find((u) => u.unitNumber === prepared.units.length + 1)
        unit = {
          id: old?.id ?? createId('unit'),
          unitNumber: prepared.units.length + 1,
          initialNumber: `${chunk.number}-${prepared.units.length + 1}`,
          sourceHeading: line,
          scriptText: '',
          scenes: parsed.scenes,
          defaultSceneKey: parsed.scenes.length === 1 && !parsed.issues.length ? sceneAssetKey(parsed.scenes[0]) : null,
          characters: [],
          shots: [],
          issues: [...parsed.issues],
        }
        if (bare) unit.issues.push('原场次缺少编号，已按顺序建立单元')
        if (parsed.continuation) {
          const source = knownScenes.get(parsed.continuation)
          if (source) {
            unit.scenes = JSON.parse(JSON.stringify(source.scenes))
            unit.defaultSceneKey = source.defaultSceneKey
          } else unit.issues.push(`未找到承接场次 ${parsed.continuation}，请补充场景`)
        }
        if (numbered) knownScenes.set(`${Number(numbered[1])}-${Number(numbered[2])}`, unit)
        if (intro.some((t) => t.trim())) unit.scriptText = intro.join('\n') + '\n'
        intro = []
        if (parsed.cast) unit.scriptText += `人物：${parsed.cast}\n`
        prepared.units.push(unit)
      } else if (unit) unit.scriptText += original + '\n'
      else intro.push(original)
    }
    if (!prepared.units.length)
      prepared.units.push({
        id: createId('unit'),
        unitNumber: 1,
        initialNumber: `${chunk.number}-1`,
        sourceHeading: '',
        scriptText: intro.join('\n').trim(),
        scenes: [],
        defaultSceneKey: null,
        characters: [],
        shots: [],
        issues: ['未识别到场次标题，请核对单元边界'],
      })
    for (const u of prepared.units) {
      u.scriptText = u.scriptText.trim()
      const add = (raw: string, voiceOnly: boolean) => {
        const asset = getAsset(raw)
        let usage = u.characters.find((c) => c.characterId === asset.id)
        if (!usage) {
          const prior = existing?.units.find((unit) => unit.id === u.id)?.characters.find((c) => c.characterId === asset.id)
          const legacy = asset.outfits.find((outfit) =>
            outfit.units.some((unit) => unit.episodeId === prepared.episodeId && unit.unitNumber === u.unitNumber),
          )
          usage = {
            characterId: asset.id,
            voiceOnly,
            sourceNames: [],
            outfitId: prior?.outfitId ?? legacy?.id ?? (asset.isMain || asset.outfits.length > 1 ? null : 'original'),
          }
          u.characters.push(usage)
        }
        if (!voiceOnly) usage.voiceOnly = false
        if (!usage.sourceNames.includes(raw)) usage.sourceNames.push(raw)
      }
      for (const line of u.scriptText.split('\n')) {
        const cast = line.trimStart().match(/^(?:出场人物|人物|角色)\s*[:：](.*)$/)
        if (cast) {
          castNames(cast[1])
            .filter((name) => baseName(name))
            .forEach((name) => add(name, false))
          continue
        }
        const speaking = speaker(
          line,
          characters.map((c) => c.name),
        )
        if (speaking) speaking.names.forEach((name) => add(name, speaking.voiceOnly))
        else if (!/^第.+集/.test(line)) {
          const action = line.replace(/【[^】]*】/g, '')
          if (/^[△▲◇◆]|^画面|^闪回画面/.test(action))
            for (const asset of [...characters]) if (action.includes(asset.name)) add(asset.name, false)
        }
      }
      const castLines = /^[ \t　]*(?:出场人物|人物|角色)[ \t　]*[:：][^\r\n]*(?:\r?\n|$)/gm
      const text = u.scriptText.replace(castLines, '').trim()
      u.scriptText = text
      const previous = existing?.shots.filter((shot) => shot.unitNumber === u.unitNumber) ?? []
      const oldUnit = existing?.units.find((unit) => unit.id === u.id)
      u.shots =
        oldUnit?.scriptText.replace(castLines, '').trim() === text && previous.length
          ? JSON.parse(JSON.stringify(previous))
          : [
              {
                ...(previous[0] ? JSON.parse(JSON.stringify(previous[0])) : createShot(u.unitNumber)),
                text,
                unitId: u.id,
                unitNumber: u.unitNumber,
              },
            ]
      if (occupied && previous.length > 1 && u.shots.length === 1) u.issues.push('正文已更新：重新拆分后按单元内的位置保留已有分镜配置')
    }
    if (chunks.filter((other) => other.number === chunk.number).length > 1) prepared.issues.push('本批次集号重复，请修改集号或跳过重复分集')
    return prepared
  })
  return {
    sourceText,
    episodes,
    characters,
    aliases,
    materialView: 'unit',
    selectedUnitId: episodes[0]?.units[0]?.id ?? null,
    selectedCharacterId: null,
  }
}

export function preparationPending(batch: ScriptPreparation) {
  return batch.episodes
    .filter((ep) => ep.action !== 'skip')
    .flatMap((ep) =>
      ep.units.flatMap((unit) =>
        unit.characters.flatMap((usage) => {
          const asset = batch.characters.find((asset) => asset.id === usage.characterId)!
          return asset && !usage.voiceOnly && !asset.isEnsemble && !usage.outfitId ? [{ episode: ep, unit, asset }] : []
        }),
      ),
    )
}

export function preparationState(state: AppState, batch: ScriptPreparation, groupId: string | null, fallbackEpisodeId: string): AppState {
  const pending = preparationPending(batch)
  if (pending.length)
    throw new Error(`请先为 ${pending[0].asset.name} 的单元 ${pending[0].episode.number}-${pending[0].unit.unitNumber} 分配服装`)
  const selected = batch.episodes.filter((ep) => ep.action !== 'skip')
  if (!selected.length) throw new Error('请至少选择一个要应用的分集')
  if (new Set(selected.map((ep) => ep.number)).size !== selected.length) throw new Error('本批次集号重复，请先核对')
  const next: AppState = JSON.parse(JSON.stringify(state))
  const assets: CharacterAsset[] = JSON.parse(JSON.stringify(batch.characters))
  const sourceShots = new Map(state.episodes.flatMap((ep) => ep.shots.map((shot) => [shot.id, shot] as const)))
  const draftIds = new Set(selected.flatMap((ep) => ep.units.flatMap((unit) => unit.shots.map((shot) => shot.id))))
  for (const ep of selected) {
    const conflict = next.episodes.find(
      (item) =>
        item.groupId === groupId &&
        item.id !== ep.episodeId &&
        Number(item.title.match(/\d+/)?.[0]) === ep.number &&
        !selected.some((selected) => selected.episodeId === item.id && selected.number !== ep.number),
    )
    if (conflict) throw new Error(`第 ${ep.number} 集已存在，请重新核对集号或将对应分集设为更新`)
    const original = next.episodes.find((item) => item.id === ep.episodeId)
    const episode = original ?? {
      ...createEpisode(ep.number, state.globalConfig.dataCollection.defaultPointCost),
      id: ep.episodeId,
      groupId,
    }
    episode.title = `第 ${String(ep.number).padStart(2, '0')} 集`
    episode.scriptText = ep.scriptText
    episode.units = ep.units.map(({ shots, issues, ...unit }) => JSON.parse(JSON.stringify(unit)))
    episode.scenes = [...episode.scenes, ...ep.units.flatMap((unit) => unit.scenes)].filter(
      (scene, i, all) => all.findIndex((item) => sceneAssetKey(item) === sceneAssetKey(scene)) === i,
    )
    episode.shots = ep.units.flatMap((unit) =>
      unit.shots.map((draft, index) => {
        const positional = original?.shots.filter((shot) => (shot.unitId ? shot.unitId === unit.id : shot.unitNumber === unit.unitNumber))[
          index
        ]
        const previous = sourceShots.get(draft.id) ?? (positional && !draftIds.has(positional.id) ? positional : undefined)
        const shot: Shot = {
          ...(previous ? JSON.parse(JSON.stringify(previous)) : createShot(unit.unitNumber)),
          ...JSON.parse(JSON.stringify(draft)),
          id: previous?.id ?? draft.id,
          unitId: unit.id,
          unitNumber: unit.unitNumber,
        }
        if (previous && previous.id !== draft.id) {
          shot.review = previous.review
          shot.status = previous.status
        }
        const chosen = unit.scenes.find((scene) => sceneAssetKey(scene) === unit.defaultSceneKey)
        if (!shot.scenes.some((scene) => scene.name.trim()) && chosen)
          shot.scenes = [createSceneConfig(chosen.name, chosen.time, chosen.space)]
        const nameMap = new Map<string, string>()
        for (const usage of unit.characters) {
          const asset = assets.find((asset) => asset.id === usage.characterId)!
          for (const name of [asset.name, ...usage.sourceNames.map(baseName)].flatMap((name) => [
            name,
            name.replace(/(?:群像|若干|们)$/, ''),
          ]))
            if (name) nameMap.set(name, asset.name)
        }
        const detected = detectCharacters(shot.text, [...nameMap.keys()]).map((c) => ({ ...c, name: nameMap.get(c.name)! }))
        const names = [
          ...new Set([
            ...shot.characters
              .filter((c) => unit.characters.some((usage) => usage.characterId === c.characterId))
              .map((c) => assets.find((asset) => asset.id === c.characterId)!.name),
            ...unit.characters
              .filter((usage) => !usage.sourceNames.length)
              .map((usage) => assets.find((asset) => asset.id === usage.characterId)!.name),
            ...detected.map((c) => c.name),
          ]),
        ]
        shot.characters = names.map((name) => {
          const asset = assets.find((a) => a.name === name)!
          const usage = unit.characters.find((c) => c.characterId === asset.id)!
          const current = shot.characters.find((c) => c.characterId === asset.id || c.name === name)
          return {
            ...(current ?? createCharacterConfig(name)),
            characterId: asset.id,
            name,
            voiceOnly: usage.voiceOnly,
            includeVoice:
              !asset.isEnsemble && (usage.voiceOnly || current?.includeVoice || detected.some((c) => c.name === name && c.includeVoice)),
          }
        })
        shot.timingSegments = reconcileTimingSegments(
          shot.text,
          shot.characters.map((c) => c.name),
          shot.timingSegments,
          shot.firstFrameMode,
        )
        return shot
      }),
    )
    if (!episode.shots.length) episode.shots = [createShot()]
    episode.splitScriptText = normalizeSplitScriptText(null, episode.shots) ?? ''
    for (const asset of assets) {
      for (const outfit of asset.outfits) outfit.units = outfit.units.filter((unit) => unit.episodeId !== episode.id)
      for (const unit of episode.units) {
        const usage = unit.characters.find((c) => c.characterId === asset.id)
        if (!usage) continue
        if (!asset.isMain && !asset.availableUnits?.some((u) => u.episodeId === episode.id && u.unitNumber === unit.unitNumber))
          (asset.availableUnits ??= []).push({ episodeId: episode.id, unitNumber: unit.unitNumber })
        if (!usage.voiceOnly && asset.outfits.length > 1) {
          const outfit = asset.outfits.find((o) => o.id === usage.outfitId) ?? (usage.outfitId === 'original' ? asset.outfits[0] : null)
          if (outfit) outfit.units.push({ episodeId: episode.id, unitNumber: unit.unitNumber })
        }
      }
    }
    if (!original) next.episodes.push(episode)
  }
  const group = next.episodeGroups.find((group) => group.id === groupId)
  if (group) {
    group.characters = assets
    group.preparation = null
  } else {
    const owner = next.episodes.find((ep) => ep.id === fallbackEpisodeId)!
    owner.preparation = null
    for (const ep of selected) next.episodes.find((item) => item.id === ep.episodeId)!.characters = JSON.parse(JSON.stringify(assets))
  }
  for (const ep of next.episodes.filter((ep) => (groupId ? ep.groupId === groupId : selected.some((item) => item.episodeId === ep.id)))) {
    for (const shot of ep.shots)
      for (const character of shot.characters) {
        const asset = assets.find((asset) => asset.id === character.characterId)
        if (asset) character.name = asset.name
      }
  }
  next.activeEpisodeId = (selected.find((ep) => ep.units.some((unit) => unit.id === batch.selectedUnitId)) ?? selected[0]).episodeId
  return next
}

export function rebindUnitCharacters(units: EpisodeUnit[], shots: Shot[], source: CharacterAsset[], target: CharacterAsset[]) {
  const selection = (asset: CharacterAsset, id: string | null | undefined) => {
    const next = target.find((item) => item.name === asset.name)!
    if (!id) return null
    if (next.outfits.length < 2) return 'original'
    const note = id === 'original' ? asset.note || '原皮' : asset.outfits.find((outfit) => outfit.id === id)?.note
    return next.outfits.find((outfit) => outfit.note === note)?.id ?? null
  }
  for (const unit of units)
    for (const usage of unit.characters) {
      const asset = source.find((asset) => asset.id === usage.characterId)
      if (!asset) continue
      usage.outfitId = selection(asset, usage.outfitId)
      usage.characterId = target.find((item) => item.name === asset.name)!.id
    }
  for (const shot of shots)
    for (const character of shot.characters) {
      const asset = source.find((asset) => asset.id === character.characterId || asset.name === character.name)
      if (!asset) continue
      if (character.outfitId) character.outfitId = selection(asset, character.outfitId)
      character.characterId = target.find((item) => item.name === asset.name)!.id
    }
}

export function remapPreparation(batch: ScriptPreparation | null, episodeIds: Map<string, string>, episodes: Episode[]) {
  if (!batch) return
  for (const ep of batch.episodes) {
    ep.episodeId = episodeIds.get(ep.episodeId) ?? ep.episodeId
    const target = episodes.find((item) => item.id === ep.episodeId)
    for (const unit of ep.units) {
      const previous = unit.id
      unit.id = target?.units.find((item) => item.unitNumber === unit.unitNumber)?.id ?? createId('unit')
      if (batch.selectedUnitId === previous) batch.selectedUnitId = unit.id
      unit.shots.forEach((shot) => {
        shot.unitId = unit.id
        if (shot.referenceEpisodeId) shot.referenceEpisodeId = episodeIds.get(shot.referenceEpisodeId) ?? null
      })
    }
  }
  for (const asset of batch.characters) {
    if (asset.availableUnits)
      asset.availableUnits = asset.availableUnits.map((unit) => ({ ...unit, episodeId: episodeIds.get(unit.episodeId) ?? unit.episodeId }))
    for (const outfit of asset.outfits)
      outfit.units = outfit.units.map((unit) => ({ ...unit, episodeId: episodeIds.get(unit.episodeId) ?? unit.episodeId }))
  }
}
