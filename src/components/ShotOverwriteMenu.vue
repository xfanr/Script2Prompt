<template>
  <el-popover v-model:visible="visible" trigger="click" placement="bottom-end" :width="300" popper-class="shot-overwrite-popover" :disabled="disabled">
    <template #reference><slot /></template>
    <div class="shot-overwrite-header"><el-checkbox v-model="expanded">相邻集数</el-checkbox></div>
    <el-checkbox-group v-model="selected" class="shot-overwrite-list">
      <el-checkbox v-for="option in choices" :key="option.value" :value="option.value" :disabled="option.disabled" :class="{ 'is-episode-start': option.divided }" :title="option.label">{{ option.label }}</el-checkbox>
    </el-checkbox-group>
    <div class="shot-overwrite-footer"><el-button type="primary" size="small" round :disabled="!selected.length" @click="confirm">确认</el-button></div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  options: (expanded: boolean) => { value: string; label: string; disabled?: boolean; divided?: boolean }[]
  disabled?: boolean
}>()
const emit = defineEmits<{ confirm: [values: string[]] }>()
const visible = ref(false)
const expanded = ref(false)
const selected = ref<string[]>([])
const choices = computed(() => props.options(expanded.value))
watch(visible, () => { expanded.value = false; selected.value = [] })
function confirm() {
  emit('confirm', [...selected.value])
  visible.value = false
}
</script>
