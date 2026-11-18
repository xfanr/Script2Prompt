<template>
  <el-form-item class="character-unit-assignment" label="分配服装" for="">
    <template #label>
      <span>分配服装</span>
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
      <div class="character-assignment-options">
        <el-button v-for="outfit in outfits" :key="outfit.id" :size="buttonSize ?? 'small'" round :disabled="actionsDisabled" @click="emit('assign', outfit.id); selected = []">{{ outfit.note }}</el-button>
        <el-popover v-model:visible="addVisible" trigger="click" placement="bottom-start" :width="250" :disabled="actionsDisabled"
          @show="nextTick(() => outfitNameInput?.focus())" @hide="outfitName = ''">
          <template #reference><el-button :icon="AddIcon" :size="buttonSize ?? 'small'" round :disabled="actionsDisabled">新增服装</el-button></template>
          <form @submit.prevent="confirmOutfit" @keydown.esc.stop.prevent="addVisible = false">
            <el-input ref="outfitNameInput" v-model="outfitName" class="joined-primary-input" placeholder="服装名称" aria-label="服装名称">
              <template #append><el-button type="primary" native-type="submit" :disabled="actionsDisabled || !outfitName.trim()">确认</el-button></template>
            </el-input>
          </form>
        </el-popover>
      </div>
    </div>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { InputInstance } from 'element-plus'
import { AddIcon } from '../icons'
import { notify } from '../notification'

const selected = defineModel<string[]>({ required: true })
const props = defineProps<{
  units: { id: string; label: string; note: string; pending: boolean; disabled?: boolean }[]
  outfits: { id: string; note: string }[]
  disabled?: boolean
  buttonSize?: 'small' | 'default'
}>()
const actionsDisabled = computed(() => props.disabled || !selected.value.length)
const pendingIds = computed(() => props.units.filter(unit => unit.pending && !unit.disabled).map(unit => unit.id))
const selectedPendingCount = computed(() => pendingIds.value.filter(id => selected.value.includes(id)).length)
const emit = defineEmits<{ assign: [id: string]; 'add-outfit': [name: string] }>()
const addVisible = ref(false)
const outfitName = ref('')
const outfitNameInput = ref<InputInstance>()

function confirmOutfit() {
  const name = outfitName.value.trim()
  if (!name) return
  if (props.outfits.some(outfit => outfit.note.trim() === name)) {
    notify.warning('同一角色的服装名称不能重复')
    return
  }
  emit('add-outfit', name)
  addVisible.value = false
  outfitName.value = ''
  selected.value = []
}
</script>
