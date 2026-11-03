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
  const cards = (episode: Episode, region: ShotCard['region']): ShotCard[] => {
    const all = episode.shots.map((shot, index) => ({ episode, shot, index, region, order: String(index + 1) }))
    if (region === 'current') return all
    if (!episode.shots.some(shot => shot.text.trim())) return []
    const unit = episode.shots[region === 'previous' ? episode.shots.length - 1 : 0].unitNumber
    const selected = all.filter(card => card.shot.unitNumber === unit)
    return selected.map((card, index) => ({ ...card, order: region === 'previous' ? `P${selected.length - index}` : `N${index + 1}` }))
  }
  const previous = current.showPreviousEpisodeUnit ? neighboringEpisode(state, current, -1).episode : null
  const next = current.showNextEpisodeUnit ? neighboringEpisode(state, current, 1).episode : null
  return [...(previous ? cards(previous, 'previous') : []), ...cards(current, 'current'), ...(next ? cards(next, 'next') : [])]
}
