<template>
  <article class="material-card" :class="{ 'is-unrecognized': !used, 'has-references': references.length > 0, 'is-compact': references.length <= 1 }" :aria-label="label">
    <div class="material-card-summary">
      <div class="material-card-meta">
        <span class="material-card-type" :aria-label="kind === 'scene' ? '场景' : kind === 'character' ? '角色' : '引用'">{{ kind === 'scene' ? '📍' : kind === 'character' ? '🙂' : '🍎' }}</span>
        <span v-if="description" class="material-card-description">{{ description }}</span>
      </div>
      <div class="material-card-name-area">
        <span class="material-card-name" :title="name">{{ name }}</span>
      </div>
    </div>
    <div v-if="references.length" class="material-card-references" :aria-label="`${name}引用名称`">
      <div v-for="reference in references" :key="`${reference.kind}:${reference.name}`" class="material-reference-block"
        :title="referenceTitle(reference.name)" @dblclick="emit('copy', reference.name)">
        <span v-if="references.length > 1">{{ reference.label }}</span>
        <MaterialReferenceIcon v-if="reference.confirmable" :name="reference.name"
          :confirmed="confirmed.includes(reference.name)" @toggle="emit('toggle', reference.name)" />
      </div>
    </div>
    <el-icon v-if="!used" class="material-card-warning" title="未引用" aria-label="未引用"><WarningFilled /></el-icon>
    <div v-if="$slots.actions" class="material-management-actions material-card-actions"><slot name="actions" /></div>
  </article>
</template>

<script setup lang="ts">
import MaterialReferenceIcon from './MaterialReferenceIcon.vue'
import { WarningFilled } from '../icons'

defineProps<{
  name: string
  label: string
  kind: 'scene' | 'character' | 'custom'
  description?: string
  used: boolean
  references: { name: string; label: string; kind: 'audio' | 'image'; confirmable: boolean }[]
  confirmed: string[]
  referenceTitle: (name: string) => string
}>()
const emit = defineEmits<{ toggle: [name: string]; copy: [name: string] }>()
</script>
