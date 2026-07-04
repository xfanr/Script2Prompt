import { computed, reactive, watch } from 'vue'
import { APP_VERSION, createEpisode, createEpisodeProductionData, createInitialState, createPromptReview, createSceneAsset, createSceneConfig, defaultBaseSettingSuffix, STORAGE_KEY } from './defaults'
import type { AppState, EpisodeProductionData, PromptReview, SceneAsset, SceneConfig } from './types'

function normalizeSceneAsset(scene: unknown): SceneAsset | null {
  if (typeof scene === 'string') {
    const name = scene.trim()
    return name ? createSceneAsset(name) : null
  }

  if (!scene || typeof scene !== 'object') {
    return null
  }

  const value = scene as Partial<SceneAsset>
  const name = typeof value.name === 'string' ? value.name.trim() : ''

  if (!name) {
    return null
  }

  return createSceneAsset(
    name,
    value.time === '深夜' ? '深夜' : '白天',
    value.space === '室外' ? '室外' : '室内',
  )
}

function normalizeSceneAssets(scenes: unknown): SceneAsset[] {
  if (!Array.isArray(scenes)) {
    return []
  }

  const normalized = scenes.map(normalizeSceneAsset).filter((scene): scene is SceneAsset => Boolean(scene))
  return normalized.filter((scene, index, list) => list.findIndex((item) => item.name === scene.name) === index)
}

function normalizeShotScene(scene: SceneConfig, assets: SceneAsset[]): SceneConfig {
  const asset = assets.find((item) => item.name === scene.name)

  return {
    ...scene,
    name: scene.name ?? '',
    time: scene.time ?? asset?.time ?? '白天',
    space: scene.space ?? asset?.space ?? '室内',
  }
}

function normalizeShotScenes(scenes: unknown, assets: SceneAsset[]): SceneConfig[] {
  if (!Array.isArray(scenes)) {
    return [createSceneConfig()]
  }

  const normalized = scenes
    .filter((scene): scene is SceneConfig => Boolean(scene) && typeof scene === 'object')
    .map((scene) => normalizeShotScene(scene, assets))

  return normalized.length ? normalized : [createSceneConfig()]
}

function normalizePromptReview(review: unknown): PromptReview {
  if (!review || typeof review !== 'object') {
    return createPromptReview()
  }

  const value = review as Partial<PromptReview>
  const rating = typeof value.rating === 'number' && Number.isFinite(value.rating)
    ? Math.max(0, Math.min(5, Math.round(value.rating)))
    : 0
  const drawCount = typeof value.drawCount === 'number' && Number.isFinite(value.drawCount)
    ? Math.max(1, Math.min(8, Math.round(value.drawCount)))
    : 1
  const legacyNoSubtitle = 'noSubtitle' in value ? Boolean((value as Partial<PromptReview> & { noSubtitle?: boolean }).noSubtitle) : false
  const noSubtitleCount = typeof value.noSubtitleCount === 'number' && Number.isFinite(value.noSubtitleCount)
    ? Math.max(0, Math.min(drawCount, Math.round(value.noSubtitleCount)))
    : legacyNoSubtitle ? drawCount : 0

  return {
    rating,
    drawCount,
    noSubtitleCount,
    note: typeof value.note === 'string' ? value.note : '',
  }
}

function normalizeEpisodeProductionData(data: unknown): EpisodeProductionData {
  if (!data || typeof data !== 'object') {
    return createEpisodeProductionData()
  }

  const value = data as Partial<EpisodeProductionData>

  return {
    pointUsage: typeof value.pointUsage === 'number' && Number.isFinite(value.pointUsage) ? Math.max(0, Math.round(value.pointUsage)) : 0,
    pointCost: typeof value.pointCost === 'number' && Number.isFinite(value.pointCost) ? Math.max(0, Number(value.pointCost.toFixed(4))) : 0,
    productionDate: typeof value.productionDate === 'string' ? value.productionDate : '',
  }
}

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return createInitialState()
  }

  try {
    const parsed = JSON.parse(raw) as AppState

    if (parsed.version !== APP_VERSION || !Array.isArray(parsed.episodes) || !parsed.globalConfig) {
      return createInitialState()
    }

    parsed.globalConfig.baseSettingSuffix ??= defaultBaseSettingSuffix
    parsed.globalConfig.autoCollapseCompletedShots ??= true
    parsed.globalConfig.recommendedDurationRange ??= { min: 4, max: 21 }
    parsed.globalConfig.recommendedDurationRange.min ??= 4
    parsed.globalConfig.recommendedDurationRange.max ??= 21
    parsed.episodeGroups ??= []
    parsed.episodeGroups.forEach((group) => {
      group.starred ??= false
    })

    const groupIds = new Set(parsed.episodeGroups.map((group) => group.id))

    parsed.episodes.forEach((episode) => {
      episode.groupId = groupIds.has(episode.groupId ?? '') ? episode.groupId : null
      episode.starred ??= false
      episode.characters ??= []
      episode.scenes = normalizeSceneAssets(episode.scenes)
      episode.props ??= []
      episode.productionData = normalizeEpisodeProductionData(episode.productionData)
      episode.scriptText = typeof episode.scriptText === 'string' ? episode.scriptText : ''
      episode.shots?.forEach((shot) => {
        shot.remark = typeof shot.remark === 'string' ? shot.remark : ''
        shot.scenes = normalizeShotScenes(shot.scenes, episode.scenes)
        shot.characters ??= []
        shot.characters.forEach((character) => {
          character.statusText ??= ''
        })
        shot.review = normalizePromptReview(shot.review)
      })
    })

    if (!parsed.episodes.length) {
      const episode = createEpisode(1)
      parsed.episodes = [episode]
      parsed.activeEpisodeId = episode.id
    }

    return parsed
  } catch {
    return createInitialState()
  }
}

export function useAppState() {
  const state = reactive<AppState>(loadState())
  let isSaving = false

  const activeEpisode = computed(() => {
    const found = state.episodes.find((episode) => episode.id === state.activeEpisodeId)

    if (found) {
      return found
    }

    state.activeEpisodeId = state.episodes[0]?.id ?? ''
    return state.episodes[0]
  })

  watch(
    state,
    () => {
      if (isSaving) {
        return
      }

      isSaving = true
      state.lastSavedAt = new Date().toISOString()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      queueMicrotask(() => {
        isSaving = false
      })
    },
    { deep: true },
  )

  return {
    state,
    activeEpisode,
  }
}
