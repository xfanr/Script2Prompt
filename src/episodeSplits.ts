import { contactEditableEpisodeIds, episodeNumber } from './episodeContacts'
import type { Episode } from './types'

export function normalizeSplitEpisodeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

export function clearInteriorSplitEpisodeNumbers(episodes: Episode[]) {
  const editable = contactEditableEpisodeIds(episodes)
  episodes.forEach((episode) => {
    if (!editable.has(episode.id)) episode.splitEpisodeNumber = null
  })
}

export function episodePreviewRanges(episodes: Episode[]) {
  const ranges: Episode[][] = []
  episodes.forEach((episode) => {
    const previousRange = ranges[ranges.length - 1]
    const previous = previousRange?.[previousRange.length - 1]
    const number = episodeNumber(episode.title)
    const previousNumber = previous ? episodeNumber(previous.title) : 0
    if (previous && previous.groupId === episode.groupId && number && previousNumber && number >= previousNumber && number <= previousNumber + 1) {
      previousRange.push(episode)
    } else {
      ranges.push([episode])
    }
  })
  return ranges.map((originals) => {
    const start = normalizeSplitEpisodeNumber(originals[0].splitEpisodeNumber)
    const end = normalizeSplitEpisodeNumber(originals[originals.length - 1].splitEpisodeNumber)
    const splitNumbers = start !== null && end !== null && end >= start
      ? Array.from({ length: end - start + 1 }, (_, index) => start + index)
      : [...new Set([start, end].filter((number): number is number => number !== null))]
    return { originals, splitNumbers }
  })
}
