<template>
  <el-icon v-if="playCount >= 2000" class="group-play-medal" :class="{ 'is-gold': playCount >= 5000 }" :aria-label="playCount >= 5000 ? '播放量达到5000' : '播放量达到2000'">
    <GoldMedal v-if="playCount >= 5000" />
    <Medal v-else />
  </el-icon>
</template>

<script setup lang="ts">
import { GoldMedal, Medal } from '@element-plus/icons-vue'

withDefaults(defineProps<{ playCount?: number }>(), { playCount: 0 })
</script>

<style scoped>
.group-play-medal {
  transform: scale(1.5);
  margin-right: 4px;
  vertical-align: -0.125em;
  flex-shrink: 0;
  color: var(--el-color-info);
}

.group-play-medal.is-gold {
  color: var(--el-color-warning);
}
</style>
