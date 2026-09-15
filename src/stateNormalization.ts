import { activePromptProfile, cloneGlobalConfig, migrateLegacyGlobalConfig, normalizeGlobalConfig } from './config'
import { APP_VERSION, createEpisode, createEpisodeProductionData, createPromptReview, createSceneAsset, createSceneConfig } from './defaults'
import { normalizeStoredShotConnection } from './shotContext'
import { compactShotUnitNumbers, normalizeShotUnitNumber } from './shotNumber'
import { reconcileTimingSegments } from './timing'
import type { AppState, EpisodeProductionData, GlobalConfig, PromptReview, SceneAsset, SceneConfig, ShotViewMode } from './types'

const shotViewModes: ShotViewMode[] = ['expanded', 'single-expanded']

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
    value.space === '无' ? '无' : value.space === '室外' ? '室外' : '室内',
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
    space: scene.space === '无' || scene.space === '室外' || scene.space === '室内'
      ? scene.space
      : asset?.space ?? '室内',
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

export function normalizeAppState(value: unknown, defaultGlobalConfig: GlobalConfig): AppState {
    const parsed = JSON.parse(JSON.stringify(value)) as AppState
    const storedVersion = parsed?.version

    if (!Number.isInteger(storedVersion) || storedVersion < 1 || storedVersion > APP_VERSION || !Array.isArray(parsed.episodes) || !parsed.globalConfig) {
      throw new Error('存档格式无效或版本不受支持')
    }

    const legacyGlobalConfig = parsed.globalConfig as unknown as { autoCollapseCompletedShots?: boolean }
    const storedShotViewMode = parsed.shotViewMode as unknown
    parsed.shotViewMode = shotViewModes.includes(storedShotViewMode as ShotViewMode)
      ? storedShotViewMode as ShotViewMode
      : 'expanded'
    parsed.singleExpandedShotId = typeof parsed.singleExpandedShotId === 'string'
      ? parsed.singleExpandedShotId
      : null
    delete legacyGlobalConfig.autoCollapseCompletedShots
    const normalizedGlobalConfig = storedVersion < 3
      ? migrateLegacyGlobalConfig(parsed.globalConfig, storedVersion, defaultGlobalConfig)
      : normalizeGlobalConfig(parsed.globalConfig)

    if (normalizedGlobalConfig) {
      syncPromptProfileNames(normalizedGlobalConfig, defaultGlobalConfig)
    }

    parsed.globalConfig = normalizedGlobalConfig ?? cloneGlobalConfig(defaultGlobalConfig)
    parsed.version = APP_VERSION
    parsed.episodeGroups ??= []
    parsed.episodeGroups.forEach((group) => {
      group.starred ??= false
      group.archived ??= false
      group.promptProfileId = activePromptProfile(parsed.globalConfig, group.promptProfileId).id
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
        shot.text = typeof shot.text === 'string' ? shot.text : ''
        shot.remark = typeof shot.remark === 'string' ? shot.remark : ''
        const hadStoredThirtySecondMode = typeof shot.thirtySecondMode === 'boolean'
        shot.thirtySecondMode = hadStoredThirtySecondMode ? shot.thirtySecondMode : true
        shot.unitNumber = normalizeShotUnitNumber(shot.unitNumber)
        Object.assign(shot, normalizeStoredShotConnection(
          shot.connectPreviousCount,
          shot.connectPrevious,
          shot.connectNextCount,
          shot.connectNext,
          index > 0,
          index < shots.length - 1,
        ))
        shot.scenes = normalizeShotScenes(shot.scenes, episode.scenes)
        const hadStoredPositionReference = typeof shot.usePositionReference === 'boolean'
        const hadReverseAngle = Boolean(shot.useReverseAngle)
        shot.usePositionReference = hadStoredPositionReference
          ? Boolean(shot.usePositionReference || hadReverseAngle)
          : true
        shot.useReverseAngle = false
        const hadStoredFirstFrameMode = typeof shot.firstFrameMode === 'boolean'
        shot.firstFrameMode = hadStoredFirstFrameMode ? shot.firstFrameMode : false
        shot.characters ??= []
        shot.characters.forEach((character) => {
          character.statusText ??= ''
        })
        const storedTimingSegments = JSON.stringify(shot.timingSegments)
        shot.timingSegments = reconcileTimingSegments(
          shot.text,
          [...episode.characters, ...shot.characters.map((character) => character.name)],
          shot.timingSegments,
        )
        shot.review = normalizePromptReview(shot.review)
      })
      compactShotUnitNumbers(episode.shots ?? [])
    })

    if (!parsed.episodes.length) {
      const episode = createEpisode(1, parsed.globalConfig.dataCollection.defaultPointCost)
      parsed.episodes = [episode]
      parsed.activeEpisodeId = episode.id
    }

    const activeEpisode = parsed.episodes.find((episode) => episode.id === parsed.activeEpisodeId) ?? parsed.episodes[0]
    parsed.activeEpisodeId = activeEpisode?.id ?? ''
    parsed.lastSavedAt = typeof parsed.lastSavedAt === 'string' ? parsed.lastSavedAt : null
    const hasSelectedShot = Boolean(
      parsed.singleExpandedShotId
      && activeEpisode?.shots.some((shot) => shot.id === parsed.singleExpandedShotId),
    )

    if (!hasSelectedShot) {
      parsed.singleExpandedShotId = null

      if (parsed.shotViewMode === 'single-expanded') {
        parsed.shotViewMode = 'expanded'
      }
    }

    return parsed
}

function syncPromptProfileNames(config: GlobalConfig, runtimeConfig: GlobalConfig) {
  config.prompt.profiles.forEach((profile, index) => {
    profile.name = runtimeConfig.prompt.profiles[index]?.name ?? profile.name
  })
}
