<template>
  <span ref="anchor" class="preparation-material-menu">
    <el-dropdown ref="dropdown" :trigger="choosingExisting ? 'click' : 'hover'" :disabled="disabled" :hide-on-click="false"
      :popper-class="choosingExisting && kind === 'characters' ? 'character-add-dropdown' : undefined"
      max-height="min(320px, calc(100vh - 32px))" @command="select" @visible-change="visible => { if (!visible) choosingExisting = false; emit('visible-change', visible) }">
      <slot><el-button :icon="kind === 'scenes' ? Location : User" text :disabled="disabled" :title="kind === 'scenes' ? '添加场景' : '添加角色'" :aria-label="kind === 'scenes' ? '添加场景' : '添加角色'" /></slot>
      <template #dropdown>
        <el-dropdown-menu v-if="!choosingExisting" @click.stop>
          <el-dropdown-item :command="{ action: 'create' }">新建素材</el-dropdown-item>
          <el-dropdown-item :command="{ action: 'existing' }">选择已有</el-dropdown-item>
        </el-dropdown-menu>
        <el-dropdown-menu v-else :class="kind === 'characters' ? ['character-add-menu', { 'has-three-columns': characters.length > 8 }] : undefined" @click.stop>
          <template v-for="group in groups" :key="group.label">
            <li v-if="group.label" class="character-add-group-heading el-select-group__title" role="presentation">
              <el-icon><component :is="group.icon" /></el-icon><span>{{ group.label }}</span>
            </li>
            <el-dropdown-item v-for="item in group.items" :key="item.value" :command="item.value">
              <span class="character-add-name" :title="item.label">{{ item.label }}</span>
            </el-dropdown-item>
          </template>
          <el-dropdown-item v-if="groups.every(group => !group.items.length)" disabled>暂无可选素材</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropdownInstance } from 'element-plus'
import { sceneAssetKey } from '../defaults'
import { Location, User, MainCharacter, Grape } from '../icons'
import type { CharacterAsset, SceneAsset } from '../types'

const props = defineProps<{ kind: 'characters' | 'scenes'; characters: CharacterAsset[]; scenes: SceneAsset[]; disabled: boolean }>()
const emit = defineEmits<{ create: [anchor: HTMLElement]; select: [value: string]; 'visible-change': [visible: boolean] }>()
const anchor = ref<HTMLElement>()
const dropdown = ref<DropdownInstance>()
const choosingExisting = ref(false)
const groups = computed(() => props.kind === 'scenes'
  ? [{ label: '', icon: Location, items: props.scenes.map(scene => ({ value: sceneAssetKey(scene), label: `${scene.time} · ${scene.space} · ${scene.name}` })) }]
  : [
    { value: 'main', label: '主角', icon: MainCharacter },
    { value: 'ordinary', label: '配角', icon: User },
    { value: 'ensemble', label: '群像', icon: Grape },
  ].map(group => ({ ...group, items: props.characters.filter(asset => (asset.isMain ? 'main' : asset.isEnsemble ? 'ensemble' : 'ordinary') === group.value)
    .map(asset => ({ value: asset.name, label: asset.name })) })).filter(group => group.items.length))

function select(command: string | { action: 'create' | 'existing' }) {
  if (typeof command !== 'string' && command.action === 'existing') { choosingExisting.value = true; return }
  dropdown.value!.handleClose()
  if (typeof command === 'string') emit('select', command)
  else emit('create', anchor.value!)
}
</script>

<style scoped>
.preparation-material-menu { display: inline-flex; }
</style>
