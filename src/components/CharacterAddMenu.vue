<template>
  <el-dropdown trigger="click" popper-class="character-add-dropdown" max-height="min(320px, calc(100vh - 32px))"
    :disabled="disabled" @command="emit('select', $event)" @visible-change="emit('visible-change', $event)">
    <slot />
    <template #dropdown>
      <el-dropdown-menu class="character-add-menu" :class="{ 'has-three-columns': assets.length > 8 }">
        <template v-for="group in groups" :key="group.value">
          <li class="character-add-group-heading el-select-group__title" role="presentation">
            <el-icon aria-hidden="true"><component :is="group.icon" /></el-icon><span>{{ group.label }}</span>
          </li>
          <el-dropdown-item v-for="item in group.items" :key="item.id" :command="item.name">
            <span class="character-add-name" :title="item.name">{{ item.name }}</span>
          </el-dropdown-item>
        </template>
        <el-dropdown-item v-if="!assets.length" class="character-add-empty" disabled>暂无可添加的角色</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MainCharacter, User, Grape } from '../icons'
import type { CharacterAsset } from '../types'

const props = defineProps<{ assets: CharacterAsset[]; disabled?: boolean }>()
const emit = defineEmits<{ select: [name: string]; 'visible-change': [visible: boolean] }>()
const types = [
  { value: 'main', label: '主角', icon: MainCharacter },
  { value: 'ordinary', label: '配角', icon: User },
  { value: 'ensemble', label: '群像', icon: Grape },
]
const groups = computed(() => types.map(group => ({ ...group, items: props.assets.filter(asset =>
  (asset.isMain ? 'main' : asset.isEnsemble ? 'ensemble' : 'ordinary') === group.value,
) })).filter(group => group.items.length))
</script>
