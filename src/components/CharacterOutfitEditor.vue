<template>
  <div class="character-outfit-editor">
    <div v-if="allowAdd || outfits.length > 1" class="character-outfit-actions">
      <el-button :icon="Plus" link type="primary" @click="add">新增服装</el-button>
      <el-dropdown v-if="outfits.length > 1" trigger="click" @command="remove">
        <el-button :icon="Delete" link type="primary" aria-label="删除服装" title="删除服装" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="(outfit, index) in outfits" :key="outfit.id" :command="outfit.id">{{ outfit.note.trim() || `未填写备注（${index + 1}）` }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <template v-if="outfits.length > 1">
      <section v-for="outfit in outfits" :key="outfit.id" class="character-outfit-card">
        <el-form-item label="备注"><el-input v-model="outfit.note" /></el-form-item>
        <el-form-item label="形象描述"><el-input v-model="outfit.appearanceDescription" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="出现单元">
          <div class="outfit-unit-grid">
            <el-check-tag v-for="unit in units" :key="`${unit.episodeId}:${unit.unitNumber}`"
              :checked="outfit.units.some(item => sameUnit(item, unit))"
              :disabled="outfits.some(other => other.id !== outfit.id && other.units.some(item => sameUnit(item, unit)))"
              @change="checked => selectUnit(outfit, unit, checked)">{{ unit.label }}</el-check-tag>
          </div>
          <span v-if="!units.length" class="empty-note">暂无使用单元</span>
        </el-form-item>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { createId } from '../defaults'
import { Delete, Plus } from '../icons'
import type { CharacterOutfit } from '../types'

const outfits = defineModel<CharacterOutfit[]>('outfits', { required: true })
const description = defineModel<string>('description', { required: true })
defineProps<{ units: { episodeId: string; unitNumber: number; label: string }[]; allowAdd: boolean }>()
const sameUnit = (a: { episodeId: string; unitNumber: number }, b: { episodeId: string; unitNumber: number }) => a.episodeId === b.episodeId && a.unitNumber === b.unitNumber
function add() {
  if (!outfits.value.length) {
    outfits.value.push({ id: createId('outfit'), note: '', appearanceDescription: description.value, units: [] })
    description.value = ''
  }
  outfits.value.push({ id: createId('outfit'), note: '', appearanceDescription: '', units: [] })
}
function remove(id: string) {
  const remaining = outfits.value.filter(outfit => outfit.id !== id)
  if (remaining.length === 1) description.value = remaining[0].appearanceDescription
  outfits.value = remaining.length === 1 ? [] : remaining
}
function selectUnit(outfit: CharacterOutfit, unit: { episodeId: string; unitNumber: number }, checked: boolean) {
  if (checked) outfit.units.push({ episodeId: unit.episodeId, unitNumber: unit.unitNumber })
  else outfit.units = outfit.units.filter(item => !sameUnit(item, unit))
}
</script>
