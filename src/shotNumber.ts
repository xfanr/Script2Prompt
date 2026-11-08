import type { Episode } from './types'
import { episodeNumber } from './episodeContacts'

export function continuousEpisodes(episodes: Episode[], current: Episode) {
  const number = episodeNumber(current.title)
  if (!number) return [current]
  const group = episodes.filter(episode => episode.groupId === current.groupId)
  const numbers = new Set(group.map(episode => episodeNumber(episode.title)))
  let first = number
  let last = number
  while (numbers.has(first - 1) && first > 1) first--
  while (numbers.has(last + 1)) last++
  return group.filter(episode => {
    const value = episodeNumber(episode.title)
    return value >= first && value <= last
  }).sort((a, b) => episodeNumber(a.title) - episodeNumber(b.title))
}

export function normalizeShotUnitNumber(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
}

export function normalizeReferenceShotNumber(value: unknown, shotCount: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= shotCount ? value : null
}

export function reconcileShotReferences(episodes: Episode[]) {
  for (const episode of episodes) {
    const sources = continuousEpisodes(episodes, episode)
    for (const shot of episode.shots) {
      const source = shot.referenceEpisodeId ? sources.find(item => item.id === shot.referenceEpisodeId) : episode
      const number = normalizeReferenceShotNumber(shot.referenceShotNumber, source?.shots.length ?? 0)
      shot.referenceShotNumber = number
      shot.referenceEpisodeId = number !== null && source && source.id !== episode.id ? source.id : null
    }
  }
}

export function formatShotReference(episode: Episode, shotIndex: number, episodes: Episode[] = [episode]) {
  const shot = episode.shots[shotIndex]
  const source = shot.referenceEpisodeId ? episodes.find(item => item.id === shot.referenceEpisodeId)! : episode
  return formatShotNumber(source, (shot.referenceShotNumber ?? shotIndex + 1) - 1)
}

export function compactShotUnitNumbers(shots: Array<{ unitNumber?: unknown }>) {
  const unitMap = new Map<number, number>()

  shots.forEach((shot) => {
    const sourceUnitNumber = normalizeShotUnitNumber(shot.unitNumber)
    let compactedUnitNumber = unitMap.get(sourceUnitNumber)

    if (!compactedUnitNumber) {
      compactedUnitNumber = unitMap.size + 1
      unitMap.set(sourceUnitNumber, compactedUnitNumber)
    }

    shot.unitNumber = compactedUnitNumber
  })
  return unitMap
}

export function formatShotNumber(episode: Episode, shotIndex: number) {
  const episodeMatch = episode.title.match(/\d+/)
  const episodeNumber = episodeMatch ? Number(episodeMatch[0]) : 0
  const shot = episode.shots[shotIndex]

  if (!shot) {
    return ''
  }

  const unitNumber = normalizeShotUnitNumber(shot.unitNumber)
  const shotNumber = episode.shots
    .slice(0, shotIndex + 1)
    .filter((item) => normalizeShotUnitNumber(item.unitNumber) === unitNumber)
    .length

  return `${episodeNumber}-${unitNumber}-${shotNumber}`
}
