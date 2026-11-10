<template>
  <button type="button" class="material-confirm-button" :class="{ 'is-confirmed': confirmed, 'is-corner': corner && !isAudio }" :aria-pressed="confirmed"
    :aria-label="`${confirmed ? '取消确认' : '确认素材'}${name}`" :title="confirmed ? '取消确认' : '确认素材'"
    @mouseenter="hovered = true" @mouseleave="hovered = false" @focus="hovered = true" @blur="hovered = false" @click="emit('toggle')" @dblclick.stop>
    <el-icon><component :is="confirmed ? FileSuccessFilled : isAudio ? hovered ? FileMusicFilled : FileMusic : hovered ? FilePdfFilled : FilePdf" /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileMusic, FileMusicFilled, FileSuccessFilled, FilePdf, FilePdfFilled } from '../icons'
const props = defineProps<{ name: string; confirmed: boolean; kind?: 'audio' | 'image'; corner?: boolean }>()
const isAudio = computed(() => props.kind === 'audio' || /\.mp3$/i.test(props.name))
const emit = defineEmits<{ toggle: [] }>()
const hovered = ref(false)
</script>
