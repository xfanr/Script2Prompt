<template>
  <el-form-item class="character-unit-assignment" label="分配皮肤" for="">
    <template #label>
      <span>分配皮肤</span>
      <el-checkbox class="character-assignment-select-all" size="small" :model-value="pendingIds.length > 0 && selectedPendingCount === pendingIds.length"
        :indeterminate="selectedPendingCount > 0 && selectedPendingCount < pendingIds.length" :disabled="disabled || !pendingIds.length"
        @change="selected = $event ? [...new Set([...selected, ...pendingIds])] : selected.filter(id => !pendingIds.includes(id))">全选待配</el-checkbox>
    </template>
    <div class="character-assignment-content">
      <div v-if="units.length" class="character-assignment-grid">
        <button v-for="unit in units" :key="unit.id" type="button" :aria-label="`选择分配单元${unit.label}`"
          :aria-pressed="selected.includes(unit.id)" :disabled="disabled || unit.disabled"
          :class="{ selected: selected.includes(unit.id), pending: unit.pending }"
          @click="selected = selected.includes(unit.id) ? selected.filter(id => id !== unit.id) : [...selected, unit.id]">
          <span>{{ unit.label }}</span><small>{{ unit.note }}</small>
        </button>
      </div>
      <p v-else class="empty-note">暂无使用单元</p>
      <template v-if="selected.length">
      <p class="character-assignment-count">将 {{ selected.length }} 个单元设为</p>
      <div class="character-assignment-options">
        <el-button :icon="AddIcon" :size="buttonSize ?? 'small'" round :disabled="disabled" @click="emit('add-outfit')">新增服装</el-button>
        <el-button v-for="outfit in outfits" :key="outfit.id" :size="buttonSize ?? 'small'" round :disabled="!selected.length || disabled" @click="emit('assign', outfit.id)">{{ outfit.note }}</el-button>
      </div>
      </template>
    </div>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AddIcon } from '../icons'

const selected = defineModel<string[]>({ required: true })
const props = defineProps<{
  units: { id: string; label: string; note: string; pending: boolean; disabled?: boolean }[]
  outfits: { id: string; note: string }[]
  disabled?: boolean
  buttonSize?: 'small' | 'default'
}>()
const pendingIds = computed(() => props.units.filter(unit => unit.pending && !unit.disabled).map(unit => unit.id))
const selectedPendingCount = computed(() => pendingIds.value.filter(id => selected.value.includes(id)).length)
const emit = defineEmits<{ assign: [id: string]; 'add-outfit': [] }>()
</script>
