import { createId } from './defaults'
import type { Episode, EpisodeGroup, EpisodeProductionData, PointEpisodeReference, PointInvoice, PointUsageRecord } from './types'

function todayDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function createPointInvoice(invoices: PointInvoice[]): PointInvoice {
  const next = invoices.reduce((max, invoice) => {
    const match = /^未开票(\d+)$/.exec(invoice.number)
    return Math.max(max, match ? Number(match[1]) : 0)
  }, 0) + 1
  return { id: createId('invoice'), number: `未开票${next}`, rechargeDate: todayDate(), producer: '杨云帆', toolType: 'updream', amount: 0, initialPoints: 0, receivedPoints: 0, usages: [] }
}

export function createPointUsage(): PointUsageRecord {
  return { id: createId('usage'), date: todayDate(), points: 1, episodes: [] }
}

export function invoicePointPrice(invoice: PointInvoice): number | null {
  if (!nonnegative(invoice.amount)) return null
  const points = invoice.initialPoints + invoice.receivedPoints
  return points > 0 ? invoice.amount / points : null
}

export function invoiceUsedPoints(invoice: PointInvoice) {
  return invoice.usages.reduce((total, usage) => total + usage.points, 0)
}

export function resolvePointEpisode(reference: PointEpisodeReference, episodes: Episode[], groups: EpisodeGroup[]) {
  const episode = episodes.find((item) => item.id === reference.episodeId)
  const group = episode ? groups.find((item) => item.id === episode.groupId)
    : groups.find((item) => item.title === reference.groupTitle)
  return {
    groupId: group?.id ?? (episode || reference.groupTitle === '未分组' ? 'ungrouped' : `deleted:${reference.groupTitle}`),
    groupTitle: group?.title ?? (episode ? '未分组' : reference.groupTitle),
    episodeTitle: episode?.title ?? reference.episodeTitle,
    deleted: !episode,
  }
}

export function canSelectPointEpisode(usage: PointUsageRecord, reference: PointEpisodeReference, episodes: Episode[], groups: EpisodeGroup[]) {
  if (usage.episodes.some((item) => item.episodeId === reference.episodeId)) return true
  const selectedGroups = new Set(usage.episodes.map((item) => resolvePointEpisode(item, episodes, groups).groupId))
  return !selectedGroups.size || (selectedGroups.size === 1 && selectedGroups.has(resolvePointEpisode(reference, episodes, groups).groupId))
}

export function formatPointInvoiceExport(source: PointInvoice, episodes: Episode[], groups: EpisodeGroup[]) {
  const invoice = normalizePointInvoices([source])[0]!
  if (!invoice.usages.length) return ''
  const price = invoicePointPrice(invoice)!
  const rows = new Map<string, { title: string; date: string; points: number; episodes: Map<string, string> }>()
  for (const usage of invoice.usages) {
    for (const reference of usage.episodes) {
      const resolved = resolvePointEpisode(reference, episodes, groups)
      let row = rows.get(resolved.groupId)
      if (!row) {
        row = { title: resolved.groupTitle, date: usage.date, points: 0, episodes: new Map() }
        rows.set(resolved.groupId, row)
      }
      row.date = row.date < usage.date ? row.date : usage.date
      row.points += usage.points / usage.episodes.length
      const match = /^(?:第\s*)?(\d+)(?:\s*集)?$/.exec(resolved.episodeTitle.trim())
      const title = match ? String(Number(match[1])).padStart(2, '0') : resolved.episodeTitle
      row.episodes.set(reference.episodeId, `${title}${resolved.deleted ? '（已删除）' : ''}`)
    }
  }
  const date = invoice.rechargeDate ? `${Number(invoice.rechargeDate.slice(5, 7))}月${Number(invoice.rechargeDate.slice(8, 10))}日` : ''
  let remaining = invoice.amount
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'zh-CN', { numeric: true }))
    .map((row) => {
      const cost = row.points * price
      remaining -= cost
      const titles = [...row.episodes.values()].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })).join('/')
      return [invoice.number, invoice.producer, `《${row.title}》`, invoice.toolType, date,
        invoice.amount.toFixed(2), invoice.initialPoints + invoice.receivedPoints, price.toFixed(4),
        Number(row.points.toFixed(2)), cost.toFixed(2), `《${row.title}》${titles}，共${row.episodes.size}集`, remaining.toFixed(2)]
        .map((value) => String(value).replace(/[\t\r\n]+/g, ' ')).join('\t')
    }).join('\n')
}

function validDate(value: unknown, optional = false): value is string {
  if (optional && value === '') return true
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function normalizePointInvoices(value: unknown): PointInvoice[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('积分记录格式无效')
  const invoiceIds = new Set<string>()
  const usageIds = new Set<string>()
  return value.map((invoice: PointInvoice) => {
    if (!invoice || typeof invoice.id !== 'string' || !invoice.id || invoiceIds.has(invoice.id)
      || typeof invoice.number !== 'string' || !invoice.number.trim()
      || (invoice.producer !== undefined && typeof invoice.producer !== 'string')
      || (invoice.toolType !== undefined && typeof invoice.toolType !== 'string')
      || !validDate(invoice.rechargeDate, true) || !nonnegative(invoice.amount)
      || !nonnegative(invoice.initialPoints) || !Number.isInteger(invoice.initialPoints)
      || !nonnegative(invoice.receivedPoints) || !Number.isInteger(invoice.receivedPoints)
      || !Array.isArray(invoice.usages)) throw new Error('发票号码、充值日期或充值金额/积分无效')
    invoiceIds.add(invoice.id)
    const usages = invoice.usages.map((usage) => {
      if (!usage || typeof usage.id !== 'string' || !usage.id || usageIds.has(usage.id)
        || !validDate(usage.date) || !nonnegative(usage.points) || !Number.isInteger(usage.points) || usage.points === 0
        || !Array.isArray(usage.episodes) || !usage.episodes.length) throw new Error(`发票“${invoice.number}”的使用记录需要日期、正整数积分和至少一个单集`)
      usageIds.add(usage.id)
      const episodeIds = new Set<string>()
      const episodes = usage.episodes.map((reference) => {
        if (!reference || typeof reference.episodeId !== 'string' || !reference.episodeId || episodeIds.has(reference.episodeId)
          || typeof reference.episodeTitle !== 'string' || typeof reference.groupTitle !== 'string') throw new Error('积分使用记录的单集关联无效')
        episodeIds.add(reference.episodeId)
        return { ...reference }
      })
      return { ...usage, episodes }
    })
    if (usages.length && invoicePointPrice(invoice) === null) throw new Error(`发票“${invoice.number}”总积分为零，不能保存使用记录`)
    return { ...invoice, number: invoice.number.trim(), producer: invoice.producer ?? '杨云帆', toolType: invoice.toolType ?? 'updream', amount: Number(invoice.amount.toFixed(2)), usages }
  })
}

export function effectiveProductionData(episode: Episode, invoices: PointInvoice[]): EpisodeProductionData & { totalCost: number; fromRecords: boolean } {
  let pointUsage = 0
  let totalCost = 0
  let productionDate = ''
  let fromRecords = false
  for (const invoice of invoices) {
    const price = invoicePointPrice(invoice)
    if (price === null) continue
    for (const usage of invoice.usages) {
      if (!usage.episodes.some((reference) => reference.episodeId === episode.id)) continue
      fromRecords = true
      const share = usage.points / usage.episodes.length
      pointUsage += share
      totalCost += share * price
      if (usage.date > productionDate) productionDate = usage.date
    }
  }
  if (!fromRecords) return { ...episode.productionData, totalCost: episode.productionData.pointUsage * episode.productionData.pointCost, fromRecords }
  return { pointUsage, pointCost: pointUsage ? totalCost / pointUsage : 0, productionDate, totalCost, fromRecords }
}

export function remapPointInvoices(invoices: PointInvoice[], episodeIds: Map<string, string>): PointInvoice[] {
  return invoices.map((invoice) => ({
    ...invoice, id: createId('invoice'),
    usages: invoice.usages.map((usage) => ({
      ...usage, id: createId('usage'),
      episodes: usage.episodes.map((reference) => {
        if (!episodeIds.has(reference.episodeId)) episodeIds.set(reference.episodeId, createId('deleted-episode'))
        return { ...reference, episodeId: episodeIds.get(reference.episodeId)! }
      }),
    })),
  }))
}

function invoiceHeaderSignature(invoice: PointInvoice) {
  return JSON.stringify({
    number: invoice.number, rechargeDate: invoice.rechargeDate, amount: invoice.amount,
    producer: invoice.producer, toolType: invoice.toolType,
    initialPoints: invoice.initialPoints, receivedPoints: invoice.receivedPoints,
  })
}

function usageSignature(usage: PointUsageRecord, existingEpisodeIds: Set<string>) {
  return JSON.stringify({
    date: usage.date, points: usage.points, episodes: usage.episodes.map((reference) => existingEpisodeIds.has(reference.episodeId)
      ? reference.episodeId : `deleted:${JSON.stringify([reference.groupTitle, reference.episodeTitle])}`).sort(),
  })
}

export function mergePointInvoices(current: PointInvoice[], incoming: PointInvoice[], existingEpisodeIds: Set<string>) {
  const result = [...current]
  for (const invoice of incoming) {
    const index = result.findIndex((item) => invoiceHeaderSignature(item) === invoiceHeaderSignature(invoice))
    if (index < 0) { result.push(invoice); continue }
    const existing = result[index]!
    const signatures = new Set(existing.usages.map((usage) => usageSignature(usage, existingEpisodeIds)))
    const usages = [...existing.usages]
    for (const usage of invoice.usages) {
      const signature = usageSignature(usage, existingEpisodeIds)
      if (signatures.has(signature)) continue
      signatures.add(signature)
      usages.push(usage)
    }
    result[index] = { ...existing, usages }
  }
  return result
}
