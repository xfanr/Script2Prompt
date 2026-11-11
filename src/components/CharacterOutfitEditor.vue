<template>
  <div class="character-outfit-editor" :class="{ 'has-multiple': outfits.length > 1 }">
    <template v-if="outfits.length > 1">
      <slot />
      <div class="character-outfit-list">
        <section v-for="outfit in outfits" :key="outfit.id" class="character-outfit-card">
          <el-form-item label="备注"><el-input v-model="outfit.note" /></el-form-item>
          <el-form-item label="出现单元">
            <div class="outfit-unit-grid">
              <el-check-tag v-for="unit in units" :key="`${unit.episodeId}:${unit.unitNumber}`"
                :checked="outfit.units.some(item => sameUnit(item, unit))"
                :disabled="outfits.some(other => other.id !== outfit.id && other.units.some(item => sameUnit(item, unit)))"
                @change="checked => selectUnit(outfit, unit, checked)">{{ unit.label }}</el-check-tag>
            </div>
            <span v-if="!units.length" class="empty-note">暂无使用单元</span>
          </el-form-item>
          <el-form-item label="形象描述">
            <div class="appearance-description-control">
              <el-switch v-model="outfit.appearanceDescriptionEnabled" aria-label="启用形象描述" />
              <el-input v-if="outfit.appearanceDescriptionEnabled" v-model="outfit.appearanceDescription" aria-label="形象描述" type="textarea" :rows="3" />
            </div>
          </el-form-item>
        </section>
      </div>
    </template>
    <template v-else>
      <el-form-item label="出现单元">
        <div v-if="units.length" class="outfit-unit-grid">
          <el-check-tag v-for="unit in units" :key="`${unit.episodeId}:${unit.unitNumber}`"
            :checked="singleUnits.some(item => sameUnit(item, unit))"
            @change="checked => selectSingleUnit(unit, checked)">{{ unit.label }}</el-check-tag>
        </div>
        <span v-else class="empty-note">暂无使用单元</span>
      </el-form-item>
      <slot />
    </template>
    <div v-if="allowAdd || outfits.length > 1" class="character-outfit-actions">
      <el-button :icon="Plus" link type="primary" aria-label="新增服装" @click="add()">新增</el-button>
      <el-button v-if="hasIncompleteSingle" :icon="SplitTurnDownRight" link type="primary" :disabled="!singleUnits.length" aria-label="拆分单元" @click="add(true)">拆分</el-button>
      <el-dropdown v-if="outfits.length > 1" class="character-outfit-delete" trigger="click" @command="remove">
        <el-button :icon="Delete" link type="primary" aria-label="删除服装" title="删除服装" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="(outfit, index) in outfits" :key="outfit.id" :command="outfit.id">{{ outfit.note.trim() || `未填写备注（${index + 1}）` }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { createId } from '../defaults'
import { computed, ref } from 'vue'
import { Delete, Plus, SplitTurnDownRight } from '../icons'
import type { CharacterOutfit } from '../types'

const outfits = defineModel<CharacterOutfit[]>('outfits', { required: true })
const description = defineModel<string>('description', { required: true })
const descriptionEnabled = defineModel<boolean>('descriptionEnabled', { required: true })
const note = defineModel<string>('note', { required: true })
const props = defineProps<{ units: { episodeId: string; unitNumber: number; label: string }[]; allowAdd: boolean }>()
type Unit = { episodeId: string; unitNumber: number }
const singleUnits = ref<Unit[]>(props.units.map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber })))
const hasIncompleteSingle = computed(() => outfits.value.length < 2 && props.units.some(unit => !singleUnits.value.some(item => sameUnit(item, unit))))
defineExpose({ hasIncompleteSingle })
const sameUnit = (a: { episodeId: string; unitNumber: number }, b: { episodeId: string; unitNumber: number }) => a.episodeId === b.episodeId && a.unitNumber === b.unitNumber
function add(split = false) {
  const next = [...outfits.value]
  if (!next.length) {
    next.push({ id: createId('outfit'), note: note.value.trim() || (split ? '原皮' : ''), appearanceDescription: description.value, appearanceDescriptionEnabled: descriptionEnabled.value, units: singleUnits.value.map(unit => ({ ...unit })) })
    description.value = ''
    descriptionEnabled.value = false
    note.value = ''
  }
  const units = split ? props.units.filter(unit => !singleUnits.value.some(item => sameUnit(item, unit))).map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber })) : []
  next.push({ id: createId('outfit'), note: '', appearanceDescription: '', appearanceDescriptionEnabled: false, units })
  outfits.value = next
}
function remove(id: string) {
  const remaining = outfits.value.filter(outfit => outfit.id !== id)
  if (remaining.length === 1) {
    description.value = remaining[0].appearanceDescription
    descriptionEnabled.value = remaining[0].appearanceDescriptionEnabled
    note.value = remaining[0].note
    singleUnits.value = props.units.map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber }))
  }
  outfits.value = remaining.length === 1 ? [] : remaining
}
function selectSingleUnit(unit: Unit, checked: boolean) {
  if (checked) singleUnits.value.push({ episodeId: unit.episodeId, unitNumber: unit.unitNumber })
  else singleUnits.value = singleUnits.value.filter(item => !sameUnit(item, unit))
}
function selectUnit(outfit: CharacterOutfit, unit: { episodeId: string; unitNumber: number }, checked: boolean) {
  if (checked) outfit.units.push({ episodeId: unit.episodeId, unitNumber: unit.unitNumber })
  else outfit.units = outfit.units.filter(item => !sameUnit(item, unit))
}
</script>
