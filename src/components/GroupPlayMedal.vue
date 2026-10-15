<template>
  <el-icon v-if="playCount >= 2000" class="group-play-medal" :class="{ 'is-info': playCount < 5000, 'is-warning': playCount >= 5000 && playCount < 10000 }" :aria-label="`播放量${playCount}`">
    <StarFilled v-if="playCount >= 20000" />
    <Flag v-else />
  </el-icon>
</template>

<script setup lang="ts">
import { Flag, StarFilled } from '@element-plus/icons-vue'

withDefaults(defineProps<{ playCount?: number }>(), { playCount: 0 })
</script>

<style scoped>
.group-play-medal {
  transform: scale(1.5);
  margin-right: 4px;
  vertical-align: -0.125em;
  flex-shrink: 0;
  color: var(--el-color-danger);
}

.group-play-medal.is-info {
  color: var(--el-color-info);
}

.group-play-medal.is-warning {
  color: var(--el-color-warning);
}
</style>
