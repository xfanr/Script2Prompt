import { createId } from './defaults'
import type { ContactPersonOption, Episode } from './types'

type ContactEpisode = Pick<Episode, 'id' | 'groupId' | 'title'>

function episodeNumber(title: string) {
  const match = title.match(/\d+/)
  const value = match ? Number(match[0]) : 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function contactEditableEpisodeIds(episodes: ContactEpisode[]) {
  const groups = new Map<string | null, Set<number>>()
  episodes.forEach((episode) => {
    const numbers = groups.get(episode.groupId) ?? new Set<number>()
    const number = episodeNumber(episode.title)
    if (number) numbers.add(number)
    groups.set(episode.groupId, numbers)
  })
  return new Set(episodes.filter((episode) => {
    const number = episodeNumber(episode.title)
    const numbers = groups.get(episode.groupId)!
    return !number || !numbers.has(number - 1) || !numbers.has(number + 1)
  }).map((episode) => episode.id))
}

export function clearInteriorEpisodeContacts(episodes: Episode[]) {
  const editable = contactEditableEpisodeIds(episodes)
  episodes.forEach((episode) => {
    if (!editable.has(episode.id) && episode.contactPerson) episode.contactPerson = ''
  })
}

export function renameEpisodeContacts(episodes: Episode[], previous: ContactPersonOption[], next: ContactPersonOption[]) {
  const nextById = new Map(next.map((option) => [option.id, option.label]))
  const renamed = new Map(previous.filter((option) => nextById.has(option.id))
    .map((option) => [option.label, nextById.get(option.id)!]))
  episodes.forEach((episode) => {
    const label = renamed.get(episode.contactPerson)
    if (label !== undefined) episode.contactPerson = label
  })
}

export function mergeContactPersonOptions(current: ContactPersonOption[], imported: ContactPersonOption[]) {
  const result = current.map((option) => ({ ...option }))
  const labels = new Set(result.map((option) => option.label))
  const ids = new Set(result.map((option) => option.id))
  imported.forEach((option) => {
    if (labels.has(option.label)) return
    const id = ids.has(option.id) ? createId('contact-person') : option.id
    result.push({ id, label: option.label })
    labels.add(option.label)
    ids.add(id)
  })
  return result
}
