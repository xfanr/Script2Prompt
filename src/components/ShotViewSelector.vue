<template>
  <el-segmented
    :model-value="state.singleExpandedShotId ?? undefined"
    :options="options"
    size="small"
    class="shot-view-segmented"
    aria-label="分镜展开模式"
    @change="$emit('change', $event)"
  >
    <template #default="{ item }">
      <span class="shot-view-index" :title="(item as ShotViewOption).label" :aria-label="(item as ShotViewOption).label">
        {{ (item as ShotViewOption).number }}
      </span>
    </template>
  </el-segmented>
</template>

<script setup lang="ts">
import type { AppState } from '../types'

type ShotViewOption = { label: string; value: string; number: string | number; disabled: boolean }

// Read the selection here so ordinary numeric navigation updates only the selector.
defineProps<{ state: Pick<AppState, 'singleExpandedShotId'>; options: ShotViewOption[] }>()
defineEmits<{ change: [value: string | number | boolean | undefined] }>()
</script>
