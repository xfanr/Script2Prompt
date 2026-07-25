import type { Episode } from './types'

export function normalizeShotUnitNumber(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
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
