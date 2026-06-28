import { computed, reactive, watch } from 'vue'
import { APP_VERSION, createEpisode, createInitialState, createPromptReview, createSceneAsset, STORAGE_KEY } from './defaults'
import type { AppState, PromptReview, SceneAsset, SceneConfig } from './types'

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

function normalizePromptReview(review: unknown): PromptReview {
  if (!review || typeof review !== 'object') {
    return createPromptReview()
  }

  const value = review as Partial<PromptReview>
  const rating = typeof value.rating === 'number' && Number.isFinite(value.rating)
    ? Math.max(0, Math.min(5, Math.round(value.rating)))
    : 0

  return {
    rating,
    noSubtitle: Boolean(value.noSubtitle),
    note: typeof value.note === 'string' ? value.note : '',
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

    parsed.globalConfig.autoCollapseCompletedShots ??= true
    parsed.globalConfig.recommendedDurationRange ??= { min: 4, max: 23 }
    parsed.globalConfig.recommendedDurationRange.min ??= 4
    parsed.globalConfig.recommendedDurationRange.max ??= 23
    parsed.episodeGroups ??= []

    const groupIds = new Set(parsed.episodeGroups.map((group) => group.id))

    parsed.episodes.forEach((episode) => {
      episode.groupId = groupIds.has(episode.groupId ?? '') ? episode.groupId : null
      episode.starred ??= false
      episode.characters ??= []
      episode.scenes = normalizeSceneAssets(episode.scenes)
      episode.props ??= []
      episode.shots?.forEach((shot) => {
        shot.scenes = Array.isArray(shot.scenes) ? shot.scenes.map((scene) => normalizeShotScene(scene, episode.scenes)) : []
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
