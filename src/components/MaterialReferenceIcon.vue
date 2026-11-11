<template>
  <button type="button" class="material-confirm-button" :class="{ 'is-confirmed': confirmed }"
    :aria-pressed="confirmed" :aria-label="`${confirmed ? '取消确认' : '确认素材'}${name}`"
    :title="confirmed ? '取消确认' : '确认素材'" @mouseenter="hovered = true" @mouseleave="hovered = false"
    @focus="hovered = true" @blur="hovered = false" @click="emit('toggle')" @dblclick.stop>
    <el-icon><component :is="confirmed || hovered ? CircleCheckFilled : CircleCheck" /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CircleCheck, CircleCheckFilled } from '../icons'
defineProps<{ name: string; confirmed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const hovered = ref(false)
</script>
