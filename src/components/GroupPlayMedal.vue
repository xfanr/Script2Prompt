<template>
  <el-icon v-if="playCount >= 2000" class="group-play-medal" :class="{ 'is-warning': playCount < 20000 }" :aria-label="`播放量${playCount}`">
    <CrownFilled v-if="playCount >= 10000" />
    <VipFilled v-else-if="playCount >= 5000" />
    <Flag v-else />
  </el-icon>
</template>

<script setup lang="ts">
import { CrownFilled, Flag, VipFilled } from '../icons'

withDefaults(defineProps<{ playCount?: number }>(), { playCount: 0 })
</script>

<style scoped>
.group-play-medal {
  flex-shrink: 0;
  color: var(--el-color-danger);
}

.group-play-medal:not(.episode-star) {
  transform: scale(1.5);
  margin-right: 4px;
  vertical-align: -0.125em;
}

.group-play-medal.is-warning {
  color: var(--el-color-warning);
}
</style>
