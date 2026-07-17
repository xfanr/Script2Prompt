export const MIN_CONNECTION_PUNCTUATION_COUNT = 0
export const MAX_CONNECTION_PUNCTUATION_COUNT = 10

const punctuationClusterPattern = /[^\P{P}@]+/gu
const punctuationAtEndPattern = /[^\P{P}@](?:@|\s)*$/u
const bracketPairs = new Map([
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['［', '］'],
  ['{', '}'],
  ['｛', '｝'],
  ['【', '】'],
  ['〔', '〕'],
  ['〈', '〉'],
  ['《', '》'],
  ['「', '」'],
  ['『', '』'],
])

export function normalizeConnectionPunctuationCount(value: unknown) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return MIN_CONNECTION_PUNCTUATION_COUNT
  }

  return Math.min(
    MAX_CONNECTION_PUNCTUATION_COUNT,
    Math.max(MIN_CONNECTION_PUNCTUATION_COUNT, Math.round(parsed)),
  )
}

export function normalizeStoredConnectionPunctuationCount(value: unknown, legacyEnabled: unknown) {
  if (!Boolean(legacyEnabled)) {
    return MIN_CONNECTION_PUNCTUATION_COUNT
  }

  return Math.max(1, normalizeConnectionPunctuationCount(value))
}

export function takeLeadingPunctuationSegments(text: string, count: number) {
  const source = text.trim()
  const clusters = punctuationClustersOutsideBrackets(source)
  const normalizedCount = normalizeConnectionPunctuationCount(count)

  if (!normalizedCount) {
    return ''
  }

  const boundary = clusters[normalizedCount - 1]

  if (!boundary || boundary.index === undefined) {
    return source
  }

  return source.slice(0, boundary.index + boundary[0].length).trim()
}

export function takeTrailingPunctuationSegments(text: string, count: number) {
  const source = text.trim()
  const maskedSource = maskBracketedContent(source)
  const clusters = Array.from(maskedSource.matchAll(punctuationClusterPattern))

  if (!source || !clusters.length) {
    return normalizeConnectionPunctuationCount(count) ? source : ''
  }

  const normalizedCount = normalizeConnectionPunctuationCount(count)
  if (!normalizedCount) {
    return ''
  }
  const endsWithPunctuation = punctuationAtEndPattern.test(maskedSource)
  const boundaryIndex = clusters.length - normalizedCount - (endsWithPunctuation ? 1 : 0)
  const boundary = clusters[boundaryIndex]

  if (!boundary || boundary.index === undefined) {
    return source
  }

  return takeTrailingTextWithSpeakerPrefix(source, boundary.index + boundary[0].length)
}

function punctuationClustersOutsideBrackets(text: string) {
  return Array.from(maskBracketedContent(text).matchAll(punctuationClusterPattern))
}

function takeTrailingTextWithSpeakerPrefix(source: string, startIndex: number) {
  let contentStart = startIndex
  while (contentStart < source.length && /\s/u.test(source[contentStart])) {
    contentStart += 1
  }

  const excerpt = source.slice(contentStart).trim()
  if (!excerpt) {
    return excerpt
  }

  const lineStart = source.lastIndexOf('\n', contentStart - 1) + 1
  const nextLineBreak = source.indexOf('\n', lineStart)
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak
  const line = source.slice(lineStart, lineEnd)
  const maskedLine = maskBracketedContent(line)
  const colonMatch = maskedLine.match(/[：:]/u)

  if (!colonMatch || colonMatch.index === undefined) {
    return excerpt
  }

  const prefixEnd = lineStart + colonMatch.index + colonMatch[0].length
  if (contentStart < prefixEnd) {
    return excerpt
  }

  const prefix = source.slice(lineStart, prefixEnd).trim()
  return prefix ? `${prefix}${excerpt}` : excerpt
}

function maskBracketedContent(text: string) {
  const ranges: Array<{ start: number; end: number }> = []
  const stack: Array<{ start: number; close: string }> = []

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const close = bracketPairs.get(character)

    if (close) {
      stack.push({ start: index, close })
      continue
    }

    const current = stack.at(-1)
    if (current && character === current.close) {
      const pair = stack.pop()
      if (pair && !stack.length) {
        ranges.push({ start: pair.start, end: index })
      }
    }
  }

  if (!ranges.length) {
    return text
  }

  const masked = text.split('')
  ranges.forEach(({ start, end }) => {
    for (let index = start; index <= end; index += 1) {
      masked[index] = ' '
    }
  })
  return masked.join('')
}
