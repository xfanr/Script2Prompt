import type { AppState, CharacterConfig, DialogueReplacementRule, Episode, EpisodeGroup, EpisodeProductionData, GlobalConfig, PromptReview, ReviewNotePrefixOption, SceneAsset, SceneConfig, SceneSpace, SceneTime, Shot } from './types'

export const STORAGE_KEY = 'script2prompt.appState.v1'
export const APP_VERSION = 4

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}


export function cloneCharacters(characters: CharacterConfig[]) {
  return characters.map((character) => ({ ...character }))
}

export function createSceneAsset(name = '', time: SceneTime = '白天', space: SceneSpace = '室内'): SceneAsset {
  return {
    name,
    time,
    space,
  }
}

export function createSceneConfig(name = '', time: SceneTime = '白天', space: SceneSpace = '室内', statusText = ''): SceneConfig {
  return {
    id: createId('scene'),
    name,
    time,
    space,
    statusText,
  }
}

export function createDialogueReplacementRule(forbidden = '', replacement = ''): DialogueReplacementRule {
  return {
    id: createId('dialogue-rule'),
    forbidden,
    replacement,
  }
}

export function createReviewNotePrefixOption(category = '', label = ''): ReviewNotePrefixOption {
  return {
    id: createId('review-note-prefix'),
    category,
    label,
  }
}

export function normalizeReviewNotePrefixOptions(options: unknown): ReviewNotePrefixOption[] {
  if (!Array.isArray(options)) {
    return []
  }

  const normalized = options.map((option) => {
    if (typeof option === 'string') {
      const [category = '', label = ''] = option.split('→')
      return createReviewNotePrefixOption(category.trim(), label.trim())
    }

    if (!option || typeof option !== 'object') {
      return null
    }

    const value = option as Partial<ReviewNotePrefixOption>
    const category = typeof value.category === 'string' ? value.category.trim() : ''
    const label = typeof value.label === 'string' ? value.label.trim() : ''

    if (!category || !label) {
      return null
    }

    return {
      id: typeof value.id === 'string' && value.id ? value.id : createId('review-note-prefix'),
      category,
      label,
    }
  }).filter((option): option is ReviewNotePrefixOption => Boolean(option))

  return normalized.filter((option, index, list) => list.findIndex((item) => item.category === option.category && item.label === option.label) === index)
}

export function createCharacterConfig(name = '', includeVoice = false): CharacterConfig {
  return {
    id: createId('character'),
    name,
    includeVoice,
    includeState: false,
    statusText: '',
  }
}

export function createPromptReview(): PromptReview {
  return {
    rating: 0,
    drawCount: 1,
    noSubtitleCount: 0,
    notePrefix: '',
    note: '',
  }
}

export function createEpisodeProductionData(pointCost = 0): EpisodeProductionData {
  return {
    pointUsage: 0,
    pointCost,
    productionDate: '',
  }
}

export function createShot(unitNumber = 1): Shot {
  const normalizedUnitNumber = Number.isInteger(unitNumber) && unitNumber > 0 ? unitNumber : 1

  return {
    id: createId('shot'),
    text: '',
    remark: '',
    unitNumber: normalizedUnitNumber,
    connectPrevious: false,
    connectPreviousCount: 0,
    connectNext: false,
    connectNextCount: 0,
    scenes: [createSceneConfig()],
    usePositionReference: false,
    useReverseAngle: false,
    characters: [],
    status: 'incomplete',
    review: createPromptReview(),
    pendingDetection: null,
    autoSyncNotice: null,
    undoCharacters: null,
  }
}

export function createEpisodeGroup(): EpisodeGroup {
  return {
    id: createId('group'),
    title: '新分组',
    starred: false,
    archived: false,
  }
}

export function formatEpisodeTitle(index: number) {
  const normalizedIndex = Math.max(1, Math.trunc(index))
  return `第 ${String(normalizedIndex).padStart(2, '0')} 集`
}

export function createEpisode(index = 1, pointCost = 0): Episode {
  return {
    id: createId('episode'),
    title: formatEpisodeTitle(index),
    characters: [],
    groupId: null,
    starred: false,
    scenes: [],
    props: [],
    productionData: createEpisodeProductionData(pointCost),
    scriptText: '',
    shots: [createShot()],
  }
}

export function createInitialState(defaultGlobalConfig: GlobalConfig): AppState {
  const globalConfig = JSON.parse(JSON.stringify(defaultGlobalConfig)) as GlobalConfig
  const episode = createEpisode(1, globalConfig.dataCollection.defaultPointCost)

  return {
    version: APP_VERSION,
    shotViewMode: 'collapse-completed',
    globalConfig,
    episodeGroups: [],
    episodes: [episode],
    activeEpisodeId: episode.id,
    lastSavedAt: null,
  }
}
