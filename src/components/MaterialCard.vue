<template>
  <article class="material-card" :class="{ 'is-unrecognized': !used, 'has-references': references.length > 0, 'is-compact': references.length <= 1 }" :aria-label="label">
    <div class="material-card-summary">
      <div class="material-card-name-area">
        <span class="material-card-type" :aria-label="kind === 'scene' ? '场景' : kind === 'character' ? '角色' : '引用'">{{ kind === 'scene' ? '🧭' : kind === 'character' ? '🙂' : '🍎' }}</span>
        <span class="material-card-name" :title="name">{{ name }}</span>
      </div>
      <span v-if="description" class="material-card-description">{{ description }}</span>
    </div>
    <div v-if="references.length" class="material-card-references" :aria-label="`${name}引用名称`">
      <div v-for="reference in references" :key="`${reference.kind}:${reference.name}`" class="material-reference-block"
        :title="referenceTitle(reference.name)" @dblclick="emit('copy', reference.name)">
        <MaterialReferenceIcon v-if="reference.confirmable" :name="reference.name"
          :confirmed="confirmed.includes(reference.name)" @toggle="emit('toggle', reference.name)" />
        <el-icon v-else-if="!ensemble" class="material-reference-file-icon" aria-hidden="true"><component :is="reference.kind === 'audio' ? FileMusic : FilePdf" /></el-icon>
        <span>{{ reference.label }}</span>
      </div>
    </div>
    <div v-if="$slots.actions" class="material-management-actions material-card-actions"><slot name="actions" /></div>
  </article>
</template>

<script setup lang="ts">
import { FileMusic, FilePdf } from '../icons'
import MaterialReferenceIcon from './MaterialReferenceIcon.vue'

defineProps<{
  name: string
  label: string
  kind: 'scene' | 'character' | 'custom'
  description?: string
  used: boolean
  ensemble?: boolean
  references: { name: string; label: string; kind: 'audio' | 'image'; confirmable: boolean }[]
  confirmed: string[]
  referenceTitle: (name: string) => string
}>()
const emit = defineEmits<{ toggle: [name: string]; copy: [name: string] }>()
</script>
