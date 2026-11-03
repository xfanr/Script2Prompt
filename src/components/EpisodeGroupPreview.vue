<template>
  <div class="group-preview-counts">
    <strong aria-label="原集数">{{ episodes.length }}</strong>
    <strong aria-label="拆分集数">{{ splitCount }}</strong>
  </div>
  <el-scrollbar max-height="320px" view-class="group-preview-scroll-content">
    <div v-for="range in ranges" :key="range.originals[0].id" class="group-preview-range">
      <div class="group-preview-originals">
        <div v-for="episode in range.originals" :key="episode.id" class="group-preview-episode" :title="originalLabel(episode)">{{ originalLabel(episode) }}</div>
      </div>
      <div class="group-preview-splits">
        <div v-for="number in range.splitNumbers" :key="number" class="group-preview-episode">{{ String(number).padStart(2, '0') }}</div>
        <div v-if="!range.splitNumbers.length" class="group-preview-episode">-</div>
      </div>
    </div>
    <div v-if="!episodes.length" class="empty-note">暂无分集</div>
  </el-scrollbar>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { episodeNumber } from '../episodeContacts'
import { episodePreviewRanges } from '../episodeSplits'
import type { Episode } from '../types'

const props = defineProps<{ episodes: Episode[] }>()
const ranges = computed(() => episodePreviewRanges(props.episodes))
const splitCount = computed(() => new Set(ranges.value.flatMap(range => range.splitNumbers)).size)

function originalLabel(episode: Episode) {
  const number = episodeNumber(episode.title)
  const label = number ? String(number).padStart(2, '0') : episode.title
  return `${label}${episode.contactPerson ? `-${episode.contactPerson}` : ''}`
}
</script>
