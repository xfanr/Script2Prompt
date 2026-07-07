import { createCharacterConfig } from './defaults'
import type {
  CharacterConfig,
  DetectedCharacter,
  GlobalConfig,
  SectionKey,
  Shot,
} from './types'

const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

type CharacterMatchCandidate = {
  name: string
  matchName: string
}

export function countNonPunctuationCharacters(text: string) {
  return Array.from(text.replace(/[\p{P}\p{S}\s]/gu, '')).length
}

export function recommendedSeconds(text: string) {
  return countNonPunctuationCharacters(text) / 6
}

export function formatSeconds(seconds: number) {
  return `${seconds.toFixed(1).replace(/\.0$/, '')} 秒`
}

export function normalizeCharacterNameForMatch(name: string) {
  return name.replace(/[（(][^（）()]*[）)]/g, '').trim()
}

export function detectCharacters(text: string, names: string[]): DetectedCharacter[] {
  const candidates = buildCharacterMatchCandidates(names)
  const searchableText = removeDialogueContent(text, candidates.map((candidate) => candidate.matchName))

  return candidates
    .filter((candidate) => text.includes(candidate.matchName))
    .filter((candidate) => searchableText.includes(candidate.matchName))
    .map((candidate) => ({
      name: candidate.name,
      includeVoice: hasDialoguePattern(text, candidate.matchName),
    }))
}

function buildCharacterMatchCandidates(names: string[]): CharacterMatchCandidate[] {
  const seen = new Set<string>()

  return names
    .map((name) => {
      const trimmed = name.trim()
      return {
        name: trimmed,
        matchName: normalizeCharacterNameForMatch(trimmed),
      }
    })
    .filter((candidate) => {
      if (!candidate.name || !candidate.matchName || seen.has(candidate.matchName)) {
        return false
      }

      seen.add(candidate.matchName)
      return true
    })
}

export function buildDetectedCharacters(detected: DetectedCharacter[]): CharacterConfig[] {
  return detected.map((character) => createCharacterConfig(character.name, character.includeVoice))
}

export function mergeDetectedCharacters(
  current: CharacterConfig[],
  detected: DetectedCharacter[],
  updateVoiceSuggestions: boolean,
) {
  const next = current.map((character) => ({ ...character }))

  detected.forEach((character) => {
    const existing = next.find((item) => item.name === character.name)

    if (!existing) {
      next.push(createCharacterConfig(character.name, character.includeVoice))
      return
    }

    if (updateVoiceSuggestions && character.includeVoice && !existing.includeVoice) {
      existing.includeVoice = true
    }
  })

  return next
}

export function composePrompt(globalConfig: GlobalConfig, shot: Shot) {
  const sectionContent: Record<SectionKey, string> = {
    base: composeBaseSection(globalConfig, shot),
    sceneRole: composeSceneRoleSection(globalConfig, shot),
    shot: shot.text.trim(),
  }

  return globalConfig.sections
    .filter((section) => section.enabled)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section, index) => {
      const number = chineseNumbers[index] ?? String(index + 1)
      const title = section.title.trim() || '未命名章节'
      return `${number}、${title}\n${sectionContent[section.key]}`
    })
    .join('\n\n')
}

function composeBaseSection(globalConfig: GlobalConfig, shot: Shot) {
  let content = globalConfig.baseSetting.trim()

  const characterCount = shot.characters.filter((character) => character.name.trim()).length

  if (characterCount > 2 && globalConfig.baseSettingSuffix.trim()) {
    content += globalConfig.baseSettingSuffix.trim()
  }

  return content
}

function composeSceneRoleSection(globalConfig: GlobalConfig, shot: Shot) {
  const lines: string[] = []

  shot.scenes
    .filter((scene) => scene.name.trim())
    .forEach((scene) => {
      const parts = [scene.time, scene.space, scene.name.trim()]

      if (scene.statusText?.trim()) {
        parts.push(scene.statusText.trim())
      }

      lines.push(`分镜场景设定在${parts.join('，')}。`)
    })

  if (shot.usePositionReference) {
    lines.push('多角色位置参考@（仅参考图中人物在空间中的位置，人物动作、姿态、情绪均以分镜详情为准）。')
  }

  shot.characters
    .filter((character) => character.name.trim())
    .forEach((character) => {
      const parts = [`${character.name.trim()}的妆造是@`]

      if (character.includeVoice) {
        parts.push('音色是@')
      }

      if (character.statusText?.trim()) {
        parts.push(character.statusText.trim())
      }

      lines.push(`${parts.join('，')}。`)
    })

  if (globalConfig.sceneRoleSuffix.trim()) {
    lines.push(globalConfig.sceneRoleSuffix.trim())
  }

  return lines.join('\n')
}

function removeDialogueContent(text: string, names: string[]) {
  if (!names.length) {
    return text
  }

  return text
    .split(/\r?\n/)
    .map((line) => {
      const speaker = names.find((name) => hasDialoguePrefix(line, name))
      return speaker ? speaker : line
    })
    .join('\n')
}

function hasDialoguePattern(text: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const dialoguePattern = new RegExp(`${escapedName}(?:[（(][^）)]*[）)])?[:：]`)
  return dialoguePattern.test(text)
}

function hasDialoguePrefix(line: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const dialoguePattern = new RegExp(`^\\s*${escapedName}(?:[（(][^）)]*[）)])?[:：]`)
  return dialoguePattern.test(line)
}
