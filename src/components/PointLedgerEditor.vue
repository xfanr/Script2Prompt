<template>
  <div class="point-ledger-editor">
    <div class="point-ledger-toolbar">
      <el-button :icon="Plus" type="primary" text @click="addInvoice">添加发票</el-button>
    </div>
    <el-empty v-if="!modelValue.length" description="暂无积分记录" :image-size="70" />
    <div v-for="invoice in modelValue" :key="invoice.id" class="point-invoice">
      <div class="point-invoice-heading">
        <strong class="point-invoice-title">{{ invoiceHeading(invoice) }}</strong>
        <div class="point-invoice-actions">
          <el-tooltip :content="invoice.reimbursed ? '取消报销' : '报销'" placement="top">
            <el-button :icon="Tickets" text type="primary" :bg="invoice.reimbursed" :aria-pressed="invoice.reimbursed" aria-label="报销" @click="toggleReimbursed(invoice)" />
          </el-tooltip>
          <el-tooltip content="精简导出" placement="top">
            <el-button :icon="DocumentCopy" text type="primary" aria-label="精简导出" @click="exportInvoice(invoice, 'simple')" />
          </el-tooltip>
          <el-tooltip content="完整导出" placement="top">
            <el-button :icon="Share" text type="primary" aria-label="完整导出" @click="exportInvoice(invoice, 'full')" />
          </el-tooltip>
          <el-button :icon="Delete" text type="primary" aria-label="删除发票" @click="removeInvoice(invoice)" />
        </div>
      </div>
      <el-form v-if="!invoice.reimbursed" label-position="top" hide-required-asterisk>
      <div class="point-invoice-identity">
        <el-form-item label="发票号码" required><el-input v-model="invoice.number" placeholder="请输入发票号码" /></el-form-item>
        <el-form-item label="充值日期"><el-date-picker :model-value="invoice.rechargeDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" @update:model-value="invoice.rechargeDate = typeof $event === 'string' ? $event : ''" /></el-form-item>
        <el-form-item label="制作人"><el-input v-model="invoice.producer" /></el-form-item>
        <el-form-item label="工具类型"><el-input v-model="invoice.toolType" /></el-form-item>
      </div>
      <div class="point-invoice-values">
        <el-form-item label="金额"><el-input-number v-model="invoice.amount" :min="0" :precision="2" :step="1" :value-on-clear="0" :controls="false" align="left" /></el-form-item>
        <el-form-item label="首充积分"><el-input-number v-model="invoice.initialPoints" :min="0" :precision="0" :value-on-clear="0" :controls="false" align="left" /></el-form-item>
        <el-form-item label="领取积分"><el-input-number v-model="invoice.receivedPoints" :min="0" :precision="0" :value-on-clear="0" :controls="false" align="left" /></el-form-item>
        <el-form-item label="积分单价"><el-input :model-value="formatPrice(invoice)" readonly /></el-form-item>
      </div>
      <div class="point-ledger-toolbar point-usage-heading">
        <span>积分详情</span>
        <el-progress class="point-usage-progress" :percentage="Math.min(100, usagePercentage(invoice))" :stroke-width="20" text-inside striped>
          <span>{{ Math.round(usagePercentage(invoice)) }}%</span>
        </el-progress>
        <el-button :icon="Plus" text type="primary" @click="invoice.usages.unshift(createPointUsage())">添加使用记录</el-button>
      </div>
      <el-alert v-if="invoiceUsedPoints(invoice) > invoice.initialPoints + invoice.receivedPoints" type="warning" :closable="false" show-icon title="使用积分超过充值总积分，仍可保存" />
      <el-table class="point-usage-table" :data="sortedUsages(invoice)" row-key="id" table-layout="fixed" show-summary :summary-method="() => usageSummary(invoice)" empty-text="暂无使用记录">
        <el-table-column label="制作剧集" min-width="240">
          <template #default="{ row: usage }">
            <el-cascader
              v-if="activeUsageId === usage.id"
              :ref="(instance) => { episodeSelector = instance as CascaderInstance | null }"
              :model-value="(usage as PointUsageRecord).episodes.map((reference) => reference.episodeId)"
              :options="activeEpisodeOptions"
              :props="episodeSelectorProps"
              collapse-tags collapse-tags-tooltip filterable clearable
              placeholder="选择剧集及单集"
              aria-label="制作剧集"
              @update:model-value="selectEpisodes(usage as PointUsageRecord, $event)"
              @visible-change="handleSelectorVisibleChange"
              @blur="activeUsageId = null"
            />
            <el-button v-else class="point-episode-trigger" text :class="{ 'is-placeholder': !usage.episodes.length }" :title="episodeSelectionLabel(usage as PointUsageRecord)" aria-label="制作剧集" @click="openEpisodeSelector(usage as PointUsageRecord)">
              <span class="point-episode-selection">{{ episodeSelectionLabel(usage as PointUsageRecord) || '选择剧集及单集' }}</span>
              <span v-if="usage.episodes.length" class="point-episode-count">，共{{ usage.episodes.length }}集</span>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="使用天数" width="170">
          <template #default="{ row: usage }">
            <el-date-picker v-model="usage.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" aria-label="使用日期" />
          </template>
        </el-table-column>
        <el-table-column label="消耗积分" width="112">
          <template #default="{ row: usage }">
            <el-input-number v-model="usage.points" :min="1" :precision="0" :controls="false" align="left" aria-label="消耗积分" />
          </template>
        </el-table-column>
        <el-table-column label="删除" width="56" align="center" class-name="point-usage-actions">
          <template #default="{ row: usage }">
            <el-button :icon="Delete" text type="primary" size="small" aria-label="删除使用记录" @click="removeUsage(invoice, usage as PointUsageRecord)" />
          </template>
        </el-table-column>
      </el-table>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessageBox, type CascaderInstance } from 'element-plus'
import { Delete, DocumentCopy, Plus, Share, Tickets } from '../icons'
import { canSelectPointEpisode, createPointInvoice, createPointUsage, formatPointInvoiceExport, invoicePointPrice, invoiceUsedPoints, resolvePointEpisode } from '../pointLedger'
import { copyText } from '../clipboard'
import { notify } from '../notification'
import type { Episode, EpisodeGroup, PointInvoice, PointUsageRecord } from '../types'

const props = defineProps<{ modelValue: PointInvoice[]; episodes: Episode[]; groups: EpisodeGroup[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: PointInvoice[]] }>()
const activeUsageId = ref<string | null>(null)
const episodeSelector = ref<CascaderInstance | null>(null)
const episodeSelectorProps = { multiple: true, emitPath: false }
const episodeById = computed(() => new Map(props.episodes.map((episode) => [episode.id, episode])))
const episodeOptionGroups = computed(() => {
  const grouped = new Map<string, Episode[]>()
  for (const episode of props.episodes) {
    const groupId = episode.groupId ?? 'ungrouped'
    const episodes = grouped.get(groupId) ?? []
    episodes.push(episode)
    grouped.set(groupId, episodes)
  }
  return [{ id: 'ungrouped', title: '未分组', archived: false }, ...props.groups]
    .sort((a, b) => Number(a.archived) - Number(b.archived))
    .map((group) => ({
      value: group.id,
      label: `${group.title}${group.archived ? '（已归档）' : ''}`,
      children: (grouped.get(group.id) ?? []).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN', { numeric: true }))
        .map((episode) => ({ value: episode.id, label: episode.title })),
    })).filter((group) => group.children.length)
})
const activeEpisodeOptions = computed(() => {
  const usage = props.modelValue.flatMap((invoice) => invoice.usages).find((usage) => usage.id === activeUsageId.value)
  if (!usage) return []
  const selectedIds = new Set(usage.episodes.map((reference) => reference.episodeId))
  const selectedGroups = new Set(usage.episodes.map((reference) => resolvePointEpisode(reference, props.episodes, props.groups).groupId))
  const options = episodeOptionGroups.value.map((group) => {
    const groupAllowed = !selectedGroups.size || (selectedGroups.size === 1 && selectedGroups.has(group.value))
    const children = group.children.map((episode) => ({ ...episode, disabled: !groupAllowed && !selectedIds.has(episode.value) }))
    return { ...group, children, disabled: children.every((episode) => episode.disabled) }
  })
  const missing = usage.episodes.filter((reference) => !episodeById.value.has(reference.episodeId))
  if (missing.length) options.push({ value: 'deleted', label: '已删除', disabled: true, children: missing.map((reference) => ({
    value: reference.episodeId, label: `${reference.groupTitle} · ${reference.episodeTitle}（已删除）`, disabled: true,
  })) })
  return options
})

function toggleReimbursed(invoice: PointInvoice) {
  invoice.reimbursed = !invoice.reimbursed
  activeUsageId.value = null
}

function episodeSelectionLabel(usage: PointUsageRecord) {
  const groups = new Map<string, { id: string; title: string; episodes: string[] }>()
  for (const reference of usage.episodes) {
    const resolved = resolvePointEpisode(reference, props.episodes, props.groups)
    let group = groups.get(resolved.groupId)
    if (!group) {
      group = { id: resolved.groupId, title: resolved.groupTitle, episodes: [] }
      groups.set(resolved.groupId, group)
    }
    const title = resolved.episodeTitle.replace(/^第\s*(\d+)\s*集$/, '$1')
    group.episodes.push(`${title}${resolved.deleted ? '（已删除）' : ''}`)
  }
  return [...groups.values()].map((group) => `《${group.title}》${group.episodes.join('/')}`).join('；')
}

async function openEpisodeSelector(usage: PointUsageRecord) {
  activeUsageId.value = usage.id
  await nextTick()
  episodeSelector.value?.focus()
  episodeSelector.value?.togglePopperVisible(true)
}

function handleSelectorVisibleChange(visible: boolean) {
  if (!visible) activeUsageId.value = null
}

function handleSelectorEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !activeUsageId.value) return
  event.preventDefault()
  event.stopPropagation()
  activeUsageId.value = null
}

onMounted(() => window.addEventListener('keydown', handleSelectorEscape, true))
onUnmounted(() => window.removeEventListener('keydown', handleSelectorEscape, true))

function addInvoice() {
  emit('update:modelValue', [createPointInvoice(props.modelValue), ...props.modelValue])
}

async function exportInvoice(invoice: PointInvoice, mode: 'full' | 'simple') {
  try {
    const text = formatPointInvoiceExport(invoice, props.episodes, props.groups, mode)
    if (!text) { notify.info('暂无可导出的使用记录'); return }
    if (await copyText(text)) notify.success('已复制发票数据')
    else notify.error('复制失败，请重试')
  } catch (error) {
    notify.warning(error instanceof Error ? error.message : '发票数据无效')
  }
}

function formatPrice(invoice: PointInvoice) {
  return invoicePointPrice(invoice)?.toFixed(4) ?? '—'
}

function usagePercentage(invoice: PointInvoice) {
  const total = invoice.initialPoints + invoice.receivedPoints
  return total > 0 ? invoiceUsedPoints(invoice) / total * 100 : 0
}

function invoiceHeading(invoice: PointInvoice) {
  return [invoice.toolType.trim(), invoice.number.trim().slice(-6)].filter(Boolean).join(' · ') || '发票'
}

function usageSummary(invoice: PointInvoice) {
  const episodeCount = new Set(invoice.usages.flatMap((usage) => usage.episodes.map((reference) => reference.episodeId))).size
  const dates = new Set(invoice.usages.map((usage) => usage.date).filter((date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date))
  return [`合计：${episodeCount}集`, `合计：${dates.size}天`, `合计：${invoiceUsedPoints(invoice)}`, '']
}

function sortedUsages(invoice: PointInvoice) {
  return invoice.usages.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

function selectEpisodes(usage: PointUsageRecord, value: unknown) {
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  usage.episodes = ids.map((id) => {
    const episode = props.episodes.find((item) => item.id === id)
    return episode ? {
      episodeId: id, episodeTitle: episode.title,
      groupTitle: props.groups.find((group) => group.id === episode.groupId)?.title ?? '未分组',
    } : usage.episodes.find((reference) => reference.episodeId === id)!
  }).filter((reference) => reference && canSelectPointEpisode(usage, reference, props.episodes, props.groups))
}

async function confirmDelete(message: string) {
  try {
    await ElMessageBox.confirm(message, '删除积分记录', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
    return true
  } catch { return false }
}

async function removeInvoice(invoice: PointInvoice) {
  if (await confirmDelete(`确认删除发票“${invoice.number}”及全部使用记录？关联单集的成本与日期将重新计算。`)) {
    emit('update:modelValue', props.modelValue.filter((item) => item.id !== invoice.id))
  }
}

async function removeUsage(invoice: PointInvoice, usage: PointUsageRecord) {
  if (await confirmDelete('确认删除这条使用记录？关联单集的成本与日期将重新计算。')) {
    invoice.usages = invoice.usages.filter((item) => item.id !== usage.id)
  }
}
</script>
