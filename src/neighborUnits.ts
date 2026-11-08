import { episodeNumber } from './episodeContacts'
import type { AppState, Episode, Shot } from './types'

export type ShotCard = { episode: Episode; shot: Shot; index: number; region: 'previous' | 'current' | 'next'; order: string }

export function neighboringEpisode(state: AppState, current: Episode, direction: -1 | 1) {
  if (!current.groupId) return { episode: null, reason: '未分组不支持上下集单元' }
  const number = episodeNumber(current.title)
  if (!number) return { episode: null, reason: '无法识别当前集号' }
  if (number + direction < 1) return { episode: null, reason: '没有上集' }
  const matches = state.episodes.filter(episode => episode.groupId === current.groupId && episodeNumber(episode.title) === number + direction)
  if (!matches.length) return { episode: null, reason: direction < 0 ? '没有上集' : '没有下集' }
  if (matches.length > 1) return { episode: null, reason: '来源集号重复' }
  if (!matches[0].shots.length) return { episode: null, reason: '来源没有分镜' }
  return { episode: matches[0], reason: '' }
}

export function visibleShotCards(state: AppState, current: Episode): ShotCard[] {
  const linkedCards = (direction: -1 | 1): ShotCard[] => {
    const cards: ShotCard[] = []
    const region = direction < 0 ? 'previous' : 'next'
    let episode = current
    while (direction < 0 ? episode.showPreviousEpisodeUnit : episode.showNextEpisodeUnit) {
      const source = neighboringEpisode(state, episode, direction).episode
      if (!source || !source.shots.some(shot => shot.text.trim())) break
      const unit = source.shots[direction < 0 ? source.shots.length - 1 : 0].unitNumber
      const selected: ShotCard[] = source.shots.flatMap((shot, index) => shot.unitNumber === unit
        ? [{ episode: source, shot, index, region, order: '' }] : [])
      if (direction < 0) cards.unshift(...selected)
      else cards.push(...selected)
      if (selected.length !== source.shots.length) break
      episode = source
    }
    return cards.map((card, index) => ({ ...card, order: direction < 0 ? `P${cards.length - index}` : `N${index + 1}` }))
  }
  return [...linkedCards(-1), ...current.shots.map((shot, index) => ({ episode: current, shot, index, region: 'current' as const, order: String(index + 1) })), ...linkedCards(1)]
}

export function linkedSourceShotIds(state: AppState): Set<string> {
  return new Set(state.episodes.filter(episode => episode.showPreviousEpisodeUnit || episode.showNextEpisodeUnit)
    .flatMap(episode => visibleShotCards(state, episode)
      .filter(card => card.region !== 'current').map(card => card.shot.id)))
}
