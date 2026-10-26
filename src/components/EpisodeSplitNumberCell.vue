<template>
  <el-popover v-model:visible="visible" trigger="click" :width="104" popper-class="episode-split-number-popover" @show="input?.focus()">
    <template #reference>
      <el-link class="episode-split-number-link" type="primary" underline="never" href="#" :aria-label="label" @click.prevent>{{ modelValue === null ? '未填写' : String(modelValue).padStart(2, '0') }}</el-link>
    </template>
    <el-input-number ref="input" v-model="draft" :min="1" :precision="0" :controls="false" :aria-label="label" placeholder="填写集号" @change="updateNumber" @keydown.enter.stop="visible = false" @keydown.esc.stop.prevent="visible = false" />
  </el-popover>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { InputNumberInstance } from 'element-plus'
import { normalizeSplitEpisodeNumber } from '../episodeSplits'

const props = defineProps<{ modelValue: number | null; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
const visible = ref(false)
const input = ref<InputNumberInstance>()
const draft = ref<number | undefined>()

watch(visible, (value) => {
  if (value) draft.value = props.modelValue ?? undefined
})

function updateNumber(value: number | undefined) {
  emit('update:modelValue', normalizeSplitEpisodeNumber(value))
}
</script>
