import type { AppState, CharacterConfig, DialogueReplacementRule, Episode, EpisodeGroup, EpisodeProductionData, GlobalConfig, PromptReview, ReviewNotePrefixOption, SceneAsset, SceneConfig, SceneSpace, SceneTime, Shot } from './types'

export const STORAGE_KEY = 'script2prompt.appState.v1'
export const APP_VERSION = 2
export const DEFAULT_POINT_COST = 0.0051

export const defaultBaseSetting = `纪实高清电影。光线通透均匀，高光不过曝，暗部保留完整细节，带轻微柔光质感。采用浅景深。禁止使用远景、全景镜头。
音频仅保留同期声，无背景音乐。
禁止出现任何字幕、文字叠加、纯画面。`

export const defaultSceneRoleSuffix =
  '所有角色采用生活化写实表演，包含眨眼频次变化等微动作；杜绝死鱼眼、站桩式表演。'

export const defaultBaseSettingSuffix =
  '禁止生成角色同款分身或双胞胎效果。'

export const defaultReviewNotePrefixPaths = [
  '模型失误→读音',
  '模型失误→穿模',
  '模型失误→位置',
  '模型失误→动作',
  '模型失误→渲染定位图',
  '模型失误→角色ID漂移',
  '模型失误→角色多胞胎',
  '抽卡失误→引用缺失',
  '抽卡失误→引用冗余',
  '抽卡失误→引用错乱',
  '抽卡失误→内容过多',
  '抽卡失误→参考图错误',
  '剧本失误→前后矛盾',
]

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}


export function cloneCharacters(characters: CharacterConfig[]) {
  return characters.map((character) => ({ ...character }))
}

export function createGlobalConfig(): GlobalConfig {
  return {
    baseSetting: defaultBaseSetting,
    baseSettingSuffix: defaultBaseSettingSuffix,
    sceneRoleSuffix: defaultSceneRoleSuffix,
    recommendedDurationRange: { min: 4, max: 21 },
    defaultPointCost: DEFAULT_POINT_COST,
    dialogueReplacementRules: [],
    reviewNotePrefixOptions: createDefaultReviewNotePrefixOptions(),
    sections: [
      { key: 'base', title: '基础设定', order: 1, enabled: true },
      { key: 'sceneRole', title: '场景与角色设定', order: 2, enabled: true },
      { key: 'shot', title: '分镜详情', order: 3, enabled: true },
    ],
  }
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

export function createDefaultReviewNotePrefixOptions(): ReviewNotePrefixOption[] {
  return defaultReviewNotePrefixPaths.map((path) => {
    const [category, label] = path.split('→')
    return createReviewNotePrefixOption(category, label)
  })
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

export function createShot(): Shot {
  return {
    id: createId('shot'),
    text: '',
    remark: '',
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

export function createEpisode(index = 1, pointCost = DEFAULT_POINT_COST): Episode {
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

export function createInitialState(): AppState {
  const globalConfig = createGlobalConfig()
  const episode = createEpisode(1, globalConfig.defaultPointCost)

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
