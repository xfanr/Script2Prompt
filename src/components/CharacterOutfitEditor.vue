<template>
  <div class="character-outfit-editor" :class="{ 'has-details': Boolean($slots.details) }">
    <div class="character-editor-left">
      <slot name="details" />
      <CharacterUnitAssignment v-model="selectedUnits" :units="assignmentUnits" :outfits="outfitCards.map(outfit => ({ id: outfit.id, note: outfitLabel(outfit) }))" :disabled="disabled"
        @assign="assign(outfitCards.find(outfit => outfit.id === $event)!)" @add-outfit="addOutfit" />
    </div>
    <div class="character-editor-right">
    <nav v-if="outfitCards.length > 1" class="character-outfit-navigation" aria-label="服装定位">
      <el-button class="character-outfit-navigation-previous" :icon="ArrowRight" text circle size="small" aria-label="向左滚动服装" @click="outfitNavigation!.scrollBy({ left: -outfitNavigation!.clientWidth, behavior: 'smooth' })" />
      <div ref="outfitNavigation" class="character-outfit-navigation-track" @wheel.prevent="outfitNavigation!.scrollLeft += $event.deltaY || $event.deltaX">
        <el-button v-for="outfit in outfitCards" :key="outfit.id" size="small" round :class="{ 'is-active': activeOutfitId === outfit.id }" :aria-current="activeOutfitId === outfit.id ? 'true' : undefined" :title="outfitLabel(outfit)" @click="goToOutfit(outfit.id)">{{ outfitLabel(outfit) }}</el-button>
      </div>
      <el-button :icon="ArrowRight" text circle size="small" aria-label="向右滚动服装" @click="outfitNavigation!.scrollBy({ left: outfitNavigation!.clientWidth, behavior: 'smooth' })" />
    </nav>
    <div ref="outfitList" class="character-outfit-list">
      <section v-for="outfit in outfitCards" :key="outfit.id" class="character-outfit-card">
        <header class="character-outfit-card-heading">
          <el-input v-if="editingOutfit?.id === outfit.id" ref="renameInputs" v-model="renameDraft" class="character-outfit-note-input" aria-label="服装备注"
            @blur="finishRename" @keydown.enter.stop.prevent="finishRename" @keydown.esc.stop.prevent="editingOutfit = null" />
          <span v-else class="character-outfit-card-title" :title="outfitLabel(outfit)">{{ outfitLabel(outfit) }}</span>
          <div class="character-outfit-card-actions" role="group" aria-label="服装操作">
            <el-button :icon="EditPen" text type="primary" size="small" title="修改备注" aria-label="修改服装备注" @click="startRename(outfit)" />
            <el-popconfirm :title="`确认删除“${outfitLabel(outfit)}”？`" :disabled="outfitCards.length === 1 || hasExternalUnits(outfit)" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(outfit.id)">
              <template #reference><el-button :icon="Delete" text type="primary" size="small" :disabled="outfitCards.length === 1 || hasExternalUnits(outfit)" :title="outfitCards.length === 1 ? '至少保留一套服装' : hasExternalUnits(outfit) ? '此服装仍用于本次范围外的单元' : '删除服装'" aria-label="删除服装" /></template>
            </el-popconfirm>
          </div>
        </header>
        <p class="character-assignment-caption outfit-assignment-summary">{{ units.filter(unit => outfit.units.some(item => sameUnit(item, unit))).map(unit => unit.label).join(' · ') || '本次未分配单元' }}</p>
        <el-form-item class="material-appearance-field" label="形象描述" for="">
          <template #label>
            <span>形象描述</span>
            <el-checkbox v-model="outfit.appearanceDescriptionEnabled" size="small" aria-label="输出形象描述">输出</el-checkbox>
            <slot name="appearance-actions" :outfit="outfit" />
          </template>
          <el-input v-if="outfit.appearanceDescriptionEnabled" v-model="outfit.appearanceDescription" aria-label="形象描述" type="textarea" :rows="3" resize="vertical" placeholder="输入角色的外貌、服装或造型描述（选填）" />
        </el-form-item>
      </section>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import type { InputInstance } from 'element-plus'
import { createId, DEFAULT_OUTFIT_NAME } from '../defaults'
import { ArrowRight, Delete, EditPen } from '../icons'
import CharacterUnitAssignment from './CharacterUnitAssignment.vue'
import type { CharacterOutfit } from '../types'

const outfits = defineModel<CharacterOutfit[]>('outfits', { required: true })
const description = defineModel<string>('description', { required: true })
const descriptionEnabled = defineModel<boolean>('descriptionEnabled', { required: true })
const note = defineModel<string>('note', { required: true })
const props = defineProps<{ units: { episodeId: string; unitNumber: number; label: string; voiceOnly?: boolean }[]; assignedUnits?: Unit[]; disabled?: boolean }>()

type Unit = { episodeId: string; unitNumber: number }
const singleUnits = ref<Unit[]>(props.assignedUnits?.map(unit => ({ ...unit })) ?? props.units.filter(unit => !unit.voiceOnly).map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber })))
const selectedUnits = ref<string[]>([])
const singleOutfit = reactive<CharacterOutfit>({
  id: createId('outfit'),
  get note() { return note.value },
  set note(value) { note.value = value },
  get appearanceDescription() { return description.value },
  set appearanceDescription(value) { description.value = value },
  get appearanceDescriptionEnabled() { return descriptionEnabled.value },
  set appearanceDescriptionEnabled(value) { descriptionEnabled.value = value },
  get units() { return singleUnits.value },
  set units(value) { singleUnits.value = value },
})
const outfitCards = computed(() => outfits.value.length > 1 ? outfits.value : [singleOutfit])
const activeOutfitId = ref(outfitCards.value[0].id)
const outfitList = ref<HTMLElement | null>(null)
const outfitNavigation = ref<HTMLElement | null>(null)
const unassignedUnits = computed(() => props.units.filter(unit => !unit.voiceOnly && !assignedOutfit(unit)))
const assignmentUnits = computed(() => props.units.map(unit => {
  const outfit = assignedOutfit(unit)
  return { id: unitKey(unit), label: unit.label, note: unit.voiceOnly ? '仅音色' : props.disabled ? '群像' : outfit ? outfitLabel(outfit) : '待分配', pending: !outfit && !unit.voiceOnly, disabled: unit.voiceOnly }
}))
const hasIncompleteSingle = computed(() => outfits.value.length < 2 && unassignedUnits.value.length > 0)
const editingOutfit = ref<CharacterOutfit | null>(null)
const renameDraft = ref('')
const renameInputs = ref<InputInstance[]>([])

defineExpose({ hasIncompleteSingle, assignedUnits: singleUnits, singleOutfitId: computed(() => singleOutfit.id) })
const sameUnit = (a: Unit, b: Unit) => a.episodeId === b.episodeId && a.unitNumber === b.unitNumber
const unitKey = (unit: Unit) => `${unit.episodeId}:${unit.unitNumber}`
function assignedOutfit(unit: Unit) { return outfitCards.value.find(outfit => outfit.units.some(item => sameUnit(item, unit))) }
function hasExternalUnits(outfit: CharacterOutfit) { return outfit.units.some(unit => !props.units.some(item => sameUnit(item, unit))) }

function outfitLabel(outfit: CharacterOutfit) {
  return outfit.note.trim() || (outfitCards.value.length === 1 ? DEFAULT_OUTFIT_NAME : '未命名服装')
}

function goToOutfit(id: string) {
  activeOutfitId.value = id
  const index = outfitCards.value.findIndex(outfit => outfit.id === id)
  const navigation = outfitNavigation.value!
  const button = navigation.children[index] as HTMLElement
  navigation.scrollTo({ left: button.offsetLeft - navigation.offsetLeft - (navigation.clientWidth - button.offsetWidth) / 2, behavior: 'smooth' })
  const list = outfitList.value!
  const card = list.children[index] as HTMLElement
  list.scrollTo({ top: list.scrollTop + card.getBoundingClientRect().top - list.getBoundingClientRect().top, behavior: 'smooth' })
}

async function startRename(outfit: CharacterOutfit) {
  activeOutfitId.value = outfit.id
  editingOutfit.value = outfit
  renameDraft.value = outfit.note
  await nextTick()
  renameInputs.value[0]?.input?.focus({ preventScroll: true })
  renameInputs.value[0]?.select()
}

function finishRename() {
  if (editingOutfit.value) editingOutfit.value.note = renameDraft.value.trim()
  editingOutfit.value = null
}

function addOutfit(name: string) {
  finishRename()
  const next = outfits.value.length > 1 ? [...outfits.value] : [{ ...singleOutfit, note: outfitLabel(singleOutfit), units: singleUnits.value.map(unit => ({ ...unit })) }]
  const added: CharacterOutfit = {
    id: createId('outfit'), note: name, appearanceDescription: '', appearanceDescriptionEnabled: false,
    units: [],
  }
  next.push(added)
  outfits.value = next
  assign(added, next)
}

function remove(id: string) {
  const index = outfits.value.findIndex(outfit => outfit.id === id)
  const remaining = outfits.value.filter(outfit => outfit.id !== id)
  if (remaining.length === 1) {
    singleOutfit.id = remaining[0].id
    description.value = remaining[0].appearanceDescription
    descriptionEnabled.value = remaining[0].appearanceDescriptionEnabled
    note.value = remaining[0].note
    singleUnits.value = [...remaining[0].units.filter(unit => !props.units.some(item => sameUnit(item, unit))), ...props.units.filter(unit => !unit.voiceOnly).map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber }))]
  }
  outfits.value = remaining.length === 1 ? [] : remaining
  if (activeOutfitId.value === id) activeOutfitId.value = remaining[Math.min(index, remaining.length - 1)].id
}

function assign(outfit: CharacterOutfit, cards = outfitCards.value) {
  for (const card of cards) card.units = card.units.filter(unit => !selectedUnits.value.includes(unitKey(unit)))
  outfit.units.push(...props.units.filter(unit => selectedUnits.value.includes(unitKey(unit))).map(({ episodeId, unitNumber }) => ({ episodeId, unitNumber })))
  activeOutfitId.value = outfit.id
  if (cards.length > 1) void nextTick(() => goToOutfit(outfit.id))
}
</script>
