<template>
  <el-dialog :model-value="modelValue" title="积分记录" width="900px" class="point-ledger-dialog" :before-close="handleBeforeClose" @update:model-value="emit('update:modelValue', $event)">
    <div class="global-config-scroll-pane">
      <PointLedgerEditor v-if="modelValue" v-model="draft" :episodes="episodes" :groups="episodeGroups" />
    </div>
    <template #footer>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import PointLedgerEditor from './PointLedgerEditor.vue'
import { normalizePointInvoices } from '../pointLedger'
import { notify } from '../notification'
import type { Episode, EpisodeGroup, PointInvoice } from '../types'

const props = defineProps<{ modelValue: boolean; invoices: PointInvoice[]; episodes: Episode[]; episodeGroups: EpisodeGroup[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [invoices: PointInvoice[]] }>()
const draft = ref<PointInvoice[]>([])
const initialSignature = ref('')

watch(() => props.modelValue, (visible) => {
  if (!visible) return
  draft.value = JSON.parse(JSON.stringify(props.invoices))
  initialSignature.value = JSON.stringify(draft.value)
}, { immediate: true })

function save() {
  try {
    const invoices = normalizePointInvoices(draft.value)
    emit('save', invoices)
    initialSignature.value = JSON.stringify(draft.value)
    emit('update:modelValue', false)
  } catch (error) {
    notify.warning(error instanceof Error ? error.message : '积分记录无效')
  }
}

async function handleBeforeClose(done: () => void) {
  if (JSON.stringify(draft.value) !== initialSignature.value) {
    try {
      await ElMessageBox.confirm('积分记录中存在尚未保存的修改，确认放弃？', '放弃修改', {
        type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', confirmButtonClass: 'button-spacing-left',
      })
    } catch { return }
  }
  done()
}
</script>
