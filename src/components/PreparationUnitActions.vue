<template>
  <div class="unit-action-group" :class="{ 'is-open': openMenus.scenes || openMenus.characters }" role="group" :aria-label="cancelable ? '所选单元操作' : '单元操作'">
    <PreparationMaterialMenu v-for="kind in (['scenes', 'characters'] as const)" :key="kind" :kind="kind" :characters="characters" :scenes="scenes" :disabled="!count"
      @create="emit('add-material', kind, $event)" @select="kind === 'scenes' ? emit('select-scene', $event) : emit('select-character', $event)"
      @visible-change="openMenus[kind] = $event" />
    <el-popconfirm :title="count > 1 ? `删除所选 ${count} 个单元及其分镜？` : '删除此单元及其分镜？'" :disabled="!count"
      confirm-button-text="删除" cancel-button-text="取消" @confirm="emit('delete')">
      <template #reference><el-button :icon="Delete" text :disabled="!count" title="删除单元" aria-label="删除单元" /></template>
    </el-popconfirm>
    <el-button v-if="cancelable" :icon="Close" text title="取消多选" aria-label="取消多选" @click="emit('cancel')" />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import PreparationMaterialMenu from './PreparationMaterialMenu.vue'
import { Delete, Close } from '../icons'
import type { CharacterAsset, SceneAsset } from '../types'

defineProps<{ characters: CharacterAsset[]; scenes: SceneAsset[]; count: number; cancelable?: boolean }>()
const emit = defineEmits<{
  'add-material': [kind: 'characters' | 'scenes', anchor: HTMLElement]
  'select-character': [name: string]
  'select-scene': [key: string]
  delete: []
  cancel: []
}>()
const openMenus = reactive({ scenes: false, characters: false })
</script>

<style scoped>
.unit-action-group{display:flex;align-items:center;gap:2px;flex-shrink:0}
.unit-action-group :deep(.el-button){width:24px;height:28px;padding:0;margin:0;color:var(--el-text-color-secondary)}
</style>
