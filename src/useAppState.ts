import { computed, reactive, watch } from 'vue'
import { normalizeDialogueReplacementRules } from './dialogue'
import { APP_VERSION, createDefaultReviewNotePrefixOptions, createEpisode, createEpisodeProductionData, createInitialState, createPromptReview, createReviewNotePrefixOption, createSceneAsset, createSceneConfig, DEFAULT_POINT_COST, defaultBaseSettingSuffix, normalizeReviewNotePrefixOptions, STORAGE_KEY } from './defaults'
import { normalizeStoredShotConnection } from './shotContext'
import type { AppState, EpisodeProductionData, GlobalConfig, PromptReview, ReviewNotePrefixOption, SceneAsset, SceneConfig, ShotViewMode } from './types'

const shotViewModes: ShotViewMode[] = ['expanded', 'collapse-completed', 'hide-completed']

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
    statusText: typeof scene.statusText === 'string' ? scene.statusText : '',
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
    notePrefix: typeof value.notePrefix === 'string' ? value.notePrefix : '',
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

function migrateReviewNotePrefixOptionsV2(options: ReviewNotePrefixOption[]) {
  const migrated = options.slice()

  insertReviewNotePrefixOption(migrated, '模型失误', '渲染定位图', '动作')
  insertReviewNotePrefixOption(migrated, '抽卡失误', '内容过多', '引用错乱')

  return migrated
}

function insertReviewNotePrefixOption(options: ReviewNotePrefixOption[], category: string, label: string, afterLabel: string) {
  if (options.some((option) => option.category === category && option.label === label)) {
    return
  }

  const anchorIndex = options.findIndex((option) => option.category === category && option.label === afterLabel)
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : options.length
  options.splice(insertIndex, 0, createReviewNotePrefixOption(category, label))
}

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return createInitialState()
  }

  try {
    const parsed = JSON.parse(raw) as AppState
    const storedVersion = parsed.version

    if (!Number.isInteger(storedVersion) || storedVersion < 1 || storedVersion > APP_VERSION || !Array.isArray(parsed.episodes) || !parsed.globalConfig) {
      return createInitialState()
    }

    const legacyGlobalConfig = parsed.globalConfig as GlobalConfig & { autoCollapseCompletedShots?: boolean }
    parsed.shotViewMode = shotViewModes.includes(parsed.shotViewMode)
      ? parsed.shotViewMode
      : legacyGlobalConfig.autoCollapseCompletedShots === false ? 'expanded' : 'collapse-completed'
    delete legacyGlobalConfig.autoCollapseCompletedShots
    parsed.globalConfig.baseSettingSuffix ??= defaultBaseSettingSuffix
    parsed.globalConfig.recommendedDurationRange ??= { min: 4, max: 21 }
    parsed.globalConfig.recommendedDurationRange.min ??= 4
    parsed.globalConfig.recommendedDurationRange.max ??= 21
    parsed.globalConfig.defaultPointCost = typeof parsed.globalConfig.defaultPointCost === 'number' && Number.isFinite(parsed.globalConfig.defaultPointCost)
      ? Math.max(0, Number(parsed.globalConfig.defaultPointCost.toFixed(4)))
      : DEFAULT_POINT_COST
    parsed.globalConfig.dialogueReplacementRules = normalizeDialogueReplacementRules(parsed.globalConfig.dialogueReplacementRules)
    const reviewNotePrefixOptions = Array.isArray(parsed.globalConfig.reviewNotePrefixOptions)
      ? normalizeReviewNotePrefixOptions(parsed.globalConfig.reviewNotePrefixOptions)
      : createDefaultReviewNotePrefixOptions()
    parsed.globalConfig.reviewNotePrefixOptions = storedVersion < 2
      ? migrateReviewNotePrefixOptionsV2(reviewNotePrefixOptions)
      : reviewNotePrefixOptions
    parsed.version = APP_VERSION
    parsed.episodeGroups ??= []
    parsed.episodeGroups.forEach((group) => {
      group.starred ??= false
      group.archived ??= false
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
      episode.shots?.forEach((shot, index, shots) => {
        shot.remark = typeof shot.remark === 'string' ? shot.remark : ''
        Object.assign(shot, normalizeStoredShotConnection(
          shot.connectPreviousCount,
          shot.connectPrevious,
          shot.connectNextCount,
          shot.connectNext,
          index > 0,
          index < shots.length - 1,
        ))
        shot.scenes = normalizeShotScenes(shot.scenes, episode.scenes)
        shot.useReverseAngle = Boolean(shot.useReverseAngle)
        shot.characters ??= []
        shot.characters.forEach((character) => {
          character.statusText ??= ''
        })
        shot.review = normalizePromptReview(shot.review)
      })
    })

    if (!parsed.episodes.length) {
      const episode = createEpisode(1, parsed.globalConfig.defaultPointCost)
      parsed.episodes = [episode]
      parsed.activeEpisodeId = episode.id
    }

    if (storedVersion < APP_VERSION) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
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
