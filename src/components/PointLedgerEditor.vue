<template>
  <div class="point-ledger-editor">
    <div class="point-ledger-toolbar">
      <el-button :icon="Plus" type="primary" text @click="addInvoice">添加发票</el-button>
    </div>
    <el-empty v-if="!modelValue.length" description="暂无积分记录" :image-size="70" />
    <el-form v-for="invoice in modelValue" :key="invoice.id" class="point-invoice" label-position="top">
      <div class="point-invoice-heading">
        <strong>{{ invoice.number || '发票' }}</strong>
        <div class="point-invoice-actions">
          <el-tooltip content="导出发票数据" placement="top">
            <el-button :icon="Share" text type="primary" aria-label="导出发票数据" @click="exportInvoice(invoice)" />
          </el-tooltip>
          <el-button :icon="Delete" text type="danger" aria-label="删除发票" @click="removeInvoice(invoice)" />
        </div>
      </div>
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
          <span>{{ Math.round(usagePercentage(invoice)) }}% {{ invoiceUsedPoints(invoice).toLocaleString() }}/{{ (invoice.initialPoints + invoice.receivedPoints).toLocaleString() }}</span>
        </el-progress>
        <el-button :icon="Plus" text type="primary" @click="invoice.usages.unshift(createPointUsage())">添加使用记录</el-button>
      </div>
      <el-alert v-if="invoiceUsedPoints(invoice) > invoice.initialPoints + invoice.receivedPoints" type="warning" :closable="false" show-icon title="使用积分超过充值总积分，仍可保存" />
      <div v-if="!invoice.usages.length" class="empty-note">暂无使用记录</div>
      <div v-for="usage in sortedUsages(invoice)" :key="usage.id" class="point-usage-row">
        <el-form-item label="制作剧集" required>
          <el-cascader
            :model-value="usage.episodes.map((reference) => reference.episodeId)"
            :options="episodeOptions(usage)"
            :props="{ multiple: true, emitPath: false }"
            collapse-tags collapse-tags-tooltip filterable clearable
            placeholder="选择剧集及单集"
            @update:model-value="selectEpisodes(usage, $event)"
          />
        </el-form-item>
        <el-form-item label="使用日期" required><el-date-picker v-model="usage.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
        <el-form-item label="使用总积分" required><el-input-number v-model="usage.points" :min="1" :precision="0" :controls="false" align="left" /></el-form-item>
        <el-button :icon="Delete" text type="danger" aria-label="删除使用记录" @click="removeUsage(invoice, usage)" />
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { Delete, Plus, Share } from '@element-plus/icons-vue'
import { canSelectPointEpisode, createPointInvoice, createPointUsage, formatPointInvoiceExport, invoicePointPrice, invoiceUsedPoints } from '../pointLedger'
import { copyText } from '../clipboard'
import { notify } from '../notification'
import type { Episode, EpisodeGroup, PointInvoice, PointUsageRecord } from '../types'

const props = defineProps<{ modelValue: PointInvoice[]; episodes: Episode[]; groups: EpisodeGroup[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: PointInvoice[]] }>()

function addInvoice() {
  emit('update:modelValue', [createPointInvoice(props.modelValue), ...props.modelValue])
}

async function exportInvoice(invoice: PointInvoice) {
  try {
    const text = formatPointInvoiceExport(invoice, props.episodes, props.groups)
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

function sortedUsages(invoice: PointInvoice) {
  return invoice.usages.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

function episodeOptions(usage: PointUsageRecord) {
  const groups = [{ id: 'ungrouped', title: '未分组', archived: false }, ...props.groups]
    .sort((a, b) => Number(a.archived) - Number(b.archived))
  const options = groups.map((group) => ({
    value: group.id,
    label: `${group.title}${group.archived ? '（已归档）' : ''}`,
    children: props.episodes.filter((episode) => (episode.groupId ?? 'ungrouped') === group.id)
      .slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-CN', { numeric: true }))
      .map((episode) => ({ value: episode.id, label: episode.title, disabled: !canSelectPointEpisode(usage,
        { episodeId: episode.id, episodeTitle: episode.title, groupTitle: group.title }, props.episodes, props.groups) })),
  })).filter((group) => group.children.length)
    .map((group) => ({ ...group, disabled: group.children.every((episode) => episode.disabled) }))
  const missing = usage.episodes.filter((reference) => !props.episodes.some((episode) => episode.id === reference.episodeId))
  if (missing.length) options.push({ value: 'deleted', label: '已删除', disabled: true, children: missing.map((reference) => ({
    value: reference.episodeId, label: `${reference.groupTitle} · ${reference.episodeTitle}（已删除）`, disabled: true,
  })) })
  return options
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
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'button-spacing-left',
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
