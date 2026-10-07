import type { EpisodeGroup, GroupResults } from './types'

export function normalizeGroupResults(value: unknown): GroupResults {
  const results = value && typeof value === 'object' ? value as Partial<GroupResults> : {}
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
  return {
    playCount: Math.round(number(results.playCount)),
    commission: Math.round(number(results.commission)),
    received: results.received === true,
  }
}

export function pendingGroupResults(groups: EpisodeGroup[]) {
  const pending = groups.filter((group) => !group.results.received && group.results.commission > 0)
    .slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-CN', { numeric: true }))
  return {
    total: pending.reduce((total, group) => total + group.results.commission, 0),
    descriptions: pending.map((group) => `《${group.title}》：${group.results.playCount} 万次播放`),
  }
}
