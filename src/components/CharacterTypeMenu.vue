<template>
  <el-dropdown trigger="click" class="character-type-menu" @command="changeType">
    <button type="button" class="material-card-description character-type-trigger" :aria-label="`切换${character.name}角色类型`" aria-haspopup="menu" @click.stop>
      {{ character.isMain ? '主角' : character.isEnsemble ? '群像' : '配角' }}
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="main" :disabled="character.isMain">主角</el-dropdown-item>
        <el-dropdown-item command="ordinary" :disabled="!character.isMain && !character.isEnsemble">配角</el-dropdown-item>
        <el-dropdown-item command="ensemble" :disabled="character.isEnsemble">群像</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import type { CharacterAsset } from '../types'

const props = defineProps<{ character: CharacterAsset }>()
function changeType(type: 'main' | 'ordinary' | 'ensemble') {
  props.character.isMain = type === 'main'
  props.character.isEnsemble = type === 'ensemble'
  if (type === 'main' && !props.character.outfits.length && !props.character.note.trim()) props.character.note = '原皮'
}
</script>
