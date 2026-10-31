<template>
  <el-drawer v-model="visible" :title="title" direction="rtl" size="380px" :modal="false" append-to-body class="prompt-profile-drawer">
    <div class="prompt-profile-manager-toolbar">
      <el-button :icon="Plus" text type="primary" @click="emit('add')">新增{{ itemLabel }}</el-button>
    </div>
    <VueDraggable v-model="orderedItems" class="prompt-profile-manager-list" :animation="150" :bubble-scroll="false" handle=".prompt-profile-drag-handle" ghost-class="character-drag-ghost">
      <div v-for="item in items" :key="item.id" class="prompt-profile-manager-row">
        <el-button class="prompt-profile-drag-handle" :icon="Sort" text type="primary" :aria-label="`拖拽排序${item.name}`" title="拖拽排序" />
        <el-input :model-value="item.name" :aria-label="`${itemLabel}名称`" :placeholder="`输入${itemLabel}名称`" @update:model-value="emit('rename', item.id, $event)" @focus="emit('select', item.id)" />
        <el-button :icon="Delete" text type="danger" :disabled="items.length === 1" :aria-label="`删除${itemLabel}${item.name}`" :title="items.length === 1 ? `至少保留一个${itemLabel}` : `删除${itemLabel}`" @click="emit('remove', item.id)" />
      </div>
    </VueDraggable>
    <template #footer>
      <el-button type="primary" @click="visible = false">完成</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { Delete, Plus, Sort } from '../icons'

const props = defineProps<{ modelValue: boolean; title: string; itemLabel: '方案' | '模板'; items: { id: string; name: string }[] }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  add: []
  remove: [id: string]
  rename: [id: string, name: string]
  select: [id: string]
  reorder: [ids: string[]]
}>()
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
const orderedItems = computed({ get: () => props.items, set: (items) => emit('reorder', items.map((item) => item.id)) })
</script>
