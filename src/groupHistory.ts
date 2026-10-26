import { effectiveProductionData } from './pointLedger'
import type { Episode, EpisodeGroup, PointInvoice } from './types'

const millisecondsPerDay = 86400000

function productionDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10) === value ? date.getTime() / millisecondsPerDay : null
}

export function latestGroupProductionDate(groupId: string, episodes: Episode[], invoices: PointInvoice[]) {
  return episodes.reduce((latest, episode) => {
    if (episode.groupId !== groupId) return latest
    const date = effectiveProductionData(episode, invoices).productionDate
    return productionDay(date) !== null && date > latest ? date : latest
  }, '')
}

export function isHistoricalEpisodeGroup(group: EpisodeGroup, latestDate: string, today: Date) {
  if (!group.archived || group.results.playCount !== 0 || group.results.commission !== 0) return false
  const latestDay = productionDay(latestDate)
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / millisecondsPerDay
  return latestDay !== null && todayDay - latestDay > 60
}
