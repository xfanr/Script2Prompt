import type {
  ActionTimingSegment,
  DialogueSpeechRate,
  DialogueTimingSegment,
  ShotTimingSegment,
} from './types'

export const SPEECH_RATE_CHARACTERS_PER_SECOND: Record<DialogueSpeechRate, number> = {
  slow: 5,
  medium: 6,
  fast: 7,
}

export interface ResolvedTimingSegment {
  id: string
  kind: ShotTimingSegment['kind']
  sourceText: string
  start: number
  end: number
  config: ShotTimingSegment
}

export interface TimingAnalysis {
  totalCharacters: number
  dialogueCharacters: number
  dialogueArticulationSeconds: number
  punctuationSeconds: number
  asyncActionSeconds: number
  synchronousActionCount: number
  totalSeconds: number
}

function createTimingSegmentId(kind: ShotTimingSegment['kind']) {
  return `timing-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimRange(text: string, start: number, end: number) {
  while (start < end && /\s/u.test(text[start])) start += 1
  while (end > start && /\s/u.test(text[end - 1])) end -= 1
  return { start, end }
}

function normalizeCharacterNames(characterNames: string[]) {
  return Array.from(new Set(characterNames
    .map((name) => name.replace(/[（(][^（）()]*[）)]/gu, '').trim())
    .filter(Boolean)))
    .sort((a, b) => b.length - a.length)
}

interface ParsedTimingSegment {
  kind: ShotTimingSegment['kind']
  sourceText: string
  start: number
  end: number
}

export function parseTimingSegments(text: string, characterNames: string[]): ParsedTimingSegment[] {
  const names = normalizeCharacterNames(characterNames)
  const prefixPattern = names.length
    ? new RegExp(`(?:${names.map(escapeRegExp).join('|')})\\s*(?:（[^）\\r\\n]*）|\\([^\\)\\r\\n]*\\))?\\s*[：:]`, 'gu')
    : null
  const result: ParsedTimingSegment[] = []

  let lineStart = 0
  for (const line of text.split('\n')) {
    const lineEnd = lineStart + line.length
    const prefixes = prefixPattern ? Array.from(line.matchAll(prefixPattern)) : []

    if (!prefixes.length) {
      const range = trimRange(text, lineStart, lineEnd)
      if (range.start < range.end) {
        result.push({
          kind: 'action',
          sourceText: text.slice(range.start, range.end),
          ...range,
        })
      }
      lineStart = lineEnd + 1
      continue
    }

    const firstPrefixStart = lineStart + (prefixes[0].index ?? 0)
    const leadingAction = trimRange(text, lineStart, firstPrefixStart)
    if (leadingAction.start < leadingAction.end) {
      result.push({
        kind: 'action',
        sourceText: text.slice(leadingAction.start, leadingAction.end),
        ...leadingAction,
      })
    }

    prefixes.forEach((prefix, index) => {
      const dialogueStart = lineStart + (prefix.index ?? 0) + prefix[0].length
      const nextPrefixStart = index + 1 < prefixes.length
        ? lineStart + (prefixes[index + 1].index ?? line.length)
        : lineEnd
      const range = trimRange(text, dialogueStart, nextPrefixStart)
      if (range.start < range.end) {
        result.push({
          kind: 'dialogue',
          sourceText: text.slice(range.start, range.end),
          ...range,
        })
      }
    })

    lineStart = lineEnd + 1
  }

  return result
}

function normalizeDialogueSegment(value: Partial<DialogueTimingSegment>, sourceText = ''): DialogueTimingSegment {
  const speechRate: DialogueSpeechRate = value.speechRate === 'slow' || value.speechRate === 'fast'
    ? value.speechRate
    : 'medium'
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createTimingSegmentId('dialogue'),
    kind: 'dialogue',
    sourceText: typeof value.sourceText === 'string' ? value.sourceText : sourceText,
    speechRate,
  }
}

function normalizeActionSegment(value: Partial<ActionTimingSegment>, sourceText = ''): ActionTimingSegment {
  const shotCount = Number.isInteger(value.shotCount) ? Math.min(5, Math.max(1, Number(value.shotCount))) : 1
  const secondsPerShot = Number.isInteger(value.secondsPerShot)
    ? Math.min(5, Math.max(1, Number(value.secondsPerShot)))
    : 2
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createTimingSegmentId('action'),
    kind: 'action',
    sourceText: typeof value.sourceText === 'string' ? value.sourceText : sourceText,
    mode: value.mode === 'sync' ? 'sync' : 'async',
    shotCount,
    secondsPerShot,
  }
}

export function normalizeTimingSegments(value: unknown): ShotTimingSegment[] {
  if (!Array.isArray(value)) return []
  const normalized: ShotTimingSegment[] = []
  value.forEach((segment) => {
    if (!segment || typeof segment !== 'object') return
    const candidate = segment as Partial<ShotTimingSegment>
    if (candidate.kind === 'dialogue') normalized.push(normalizeDialogueSegment(candidate as Partial<DialogueTimingSegment>))
    if (candidate.kind === 'action') normalized.push(normalizeActionSegment(candidate as Partial<ActionTimingSegment>))
  })
  return normalized
}

export function reconcileTimingSegments(
  text: string,
  characterNames: string[],
  existingValue: unknown,
): ShotTimingSegment[] {
  const parsed = parseTimingSegments(text, characterNames)
  const existing = normalizeTimingSegments(existingValue)
  const used = new Set<number>()
  const matches = new Map<number, ShotTimingSegment>()

  parsed.forEach((segment, parsedIndex) => {
    const exactIndex = existing.findIndex((candidate, index) => (
      !used.has(index)
      && candidate.kind === segment.kind
      && candidate.sourceText === segment.sourceText
    ))
    if (exactIndex >= 0) {
      used.add(exactIndex)
      matches.set(parsedIndex, existing[exactIndex])
    }
  })

  parsed.forEach((segment, parsedIndex) => {
    if (matches.has(parsedIndex)) return
    const candidate = existing[parsedIndex]
    if (candidate && !used.has(parsedIndex) && candidate.kind === segment.kind) {
      used.add(parsedIndex)
      matches.set(parsedIndex, candidate)
    }
  })

  return parsed.map((segment, index) => {
    const matched = matches.get(index)
    if (segment.kind === 'dialogue') {
      return normalizeDialogueSegment(
        matched?.kind === 'dialogue' ? matched : {},
        segment.sourceText,
      )
    }
    return normalizeActionSegment(
      matched?.kind === 'action' ? matched : {},
      segment.sourceText,
    )
  }).map((segment, index) => ({ ...segment, sourceText: parsed[index].sourceText }))
}

export function resolveTimingSegments(
  text: string,
  characterNames: string[],
  existingValue: unknown,
): ResolvedTimingSegment[] {
  const parsed = parseTimingSegments(text, characterNames)
  const configs = reconcileTimingSegments(text, characterNames, existingValue)
  return parsed.map((segment, index) => ({
    ...segment,
    id: configs[index].id,
    config: configs[index],
  }))
}

export function countNonPunctuationCharacters(text: string) {
  return Array.from(text.replace(/[\p{P}\p{S}\s]/gu, '')).length
}

function spokenTextInRange(text: string, rangeStart: number, rangeEnd: number) {
  let parenthesisDepth = 0
  let result = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '（' || character === '(') {
      parenthesisDepth += 1
      continue
    }
    if (character === '）' || character === ')') {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1)
      continue
    }
    if (index >= rangeStart && index < rangeEnd && parenthesisDepth === 0) {
      result += character
    }
  }
  return result
}

function punctuationPauseSeconds(text: string) {
  const clusters = text.match(/[\p{P}\p{S}]+/gu) ?? []
  return clusters.reduce((total, cluster) => {
    let pause = 0
    if (/[、]/u.test(cluster)) pause = Math.max(pause, 0.15)
    if (/[，,；;：:]/u.test(cluster)) pause = Math.max(pause, 0.3)
    if (/[。.!！?？]/u.test(cluster)) pause = Math.max(pause, 0.6)
    if (/…|—|\.{3,}/u.test(cluster)) pause = Math.max(pause, 0.8)
    return total + pause
  }, 0)
}

export function createEmptyTimingAnalysis(): TimingAnalysis {
  return {
    totalCharacters: 0,
    dialogueCharacters: 0,
    dialogueArticulationSeconds: 0,
    punctuationSeconds: 0,
    asyncActionSeconds: 0,
    synchronousActionCount: 0,
    totalSeconds: 0,
  }
}

export function analyzeTimingRange(
  text: string,
  characterNames: string[],
  timingSegments: unknown,
  rangeStart = 0,
  rangeEnd = text.length,
): TimingAnalysis {
  const start = Math.max(0, Math.min(text.length, rangeStart))
  const end = Math.max(start, Math.min(text.length, rangeEnd))
  const analysis = createEmptyTimingAnalysis()
  analysis.totalCharacters = countNonPunctuationCharacters(text.slice(start, end))

  resolveTimingSegments(text, characterNames, timingSegments).forEach((segment) => {
    const overlapStart = Math.max(start, segment.start)
    const overlapEnd = Math.min(end, segment.end)
    if (overlapStart >= overlapEnd) return

    const overlapText = text.slice(overlapStart, overlapEnd)
    if (segment.config.kind === 'dialogue') {
      const spokenText = spokenTextInRange(
        segment.sourceText,
        overlapStart - segment.start,
        overlapEnd - segment.start,
      )
      const characterCount = countNonPunctuationCharacters(spokenText)
      analysis.dialogueCharacters += characterCount
      analysis.dialogueArticulationSeconds += characterCount / SPEECH_RATE_CHARACTERS_PER_SECOND[segment.config.speechRate]
      analysis.punctuationSeconds += punctuationPauseSeconds(spokenText)
      return
    }

    if (segment.config.mode === 'sync') {
      analysis.synchronousActionCount += 1
      return
    }

    const fullCharacterCount = countNonPunctuationCharacters(segment.sourceText)
    const overlapCharacterCount = countNonPunctuationCharacters(overlapText)
    const fullDuration = segment.config.shotCount * segment.config.secondsPerShot
    analysis.asyncActionSeconds += fullCharacterCount > 0
      ? fullDuration * overlapCharacterCount / fullCharacterCount
      : fullDuration
  })

  analysis.totalSeconds = analysis.dialogueArticulationSeconds
    + analysis.punctuationSeconds
    + analysis.asyncActionSeconds
  return analysis
}

export function sumTimingAnalyses(analyses: TimingAnalysis[]): TimingAnalysis {
  const total = analyses.reduce((result, analysis) => ({
    totalCharacters: result.totalCharacters + analysis.totalCharacters,
    dialogueCharacters: result.dialogueCharacters + analysis.dialogueCharacters,
    dialogueArticulationSeconds: result.dialogueArticulationSeconds + analysis.dialogueArticulationSeconds,
    punctuationSeconds: result.punctuationSeconds + analysis.punctuationSeconds,
    asyncActionSeconds: result.asyncActionSeconds + analysis.asyncActionSeconds,
    synchronousActionCount: result.synchronousActionCount + analysis.synchronousActionCount,
    totalSeconds: result.totalSeconds + analysis.totalSeconds,
  }), createEmptyTimingAnalysis())
  return total
}
