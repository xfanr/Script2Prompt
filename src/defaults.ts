import type { AppState, CharacterConfig, Episode, EpisodeGroup, EpisodeProductionData, GlobalConfig, PromptReview, SceneAsset, SceneConfig, SceneSpace, SceneTime, Shot } from './types'

export const STORAGE_KEY = 'script2prompt.appState.v1'
export const APP_VERSION = 1

export const defaultBaseSetting = `纪实高清电影。光线通透均匀，高光不过曝，暗部保留完整细节，带轻微柔光质感。采用浅景深。禁止使用远景、全景镜头。
音频仅保留同期声，无背景音乐。
禁止出现任何字幕、文字叠加、纯画面。`

export const defaultSceneRoleSuffix =
  '所有角色采用生活化写实表演，包含眨眼频次变化等微动作；杜绝死鱼眼、站桩式表演。'

export const defaultBaseSettingSuffix =
  '禁止生成角色同款分身或双胞胎效果。'

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
    autoCollapseCompletedShots: true,
    recommendedDurationRange: { min: 4, max: 21 },
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

export function createSceneConfig(name = '', time: SceneTime = '白天', space: SceneSpace = '室内'): SceneConfig {
  return {
    id: createId('scene'),
    name,
    time,
    space,
  }
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
    note: '',
  }
}

export function createEpisodeProductionData(): EpisodeProductionData {
  return {
    pointUsage: 0,
    pointCost: 0,
    productionDate: '',
  }
}

export function createShot(): Shot {
  return {
    id: createId('shot'),
    text: '',
    remark: '',
    scenes: [createSceneConfig()],
    usePositionReference: false,
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
  }
}

export function createEpisode(index = 1): Episode {
  return {
    id: createId('episode'),
    title: '第 x 集',
    characters: [],
    groupId: null,
    starred: false,
    scenes: [],
    props: [],
    productionData: createEpisodeProductionData(),
    scriptText: '',
    shots: [createShot()],
  }
}

export function createInitialState(): AppState {
  const episode = createEpisode(1)

  return {
    version: APP_VERSION,
    globalConfig: createGlobalConfig(),
    episodeGroups: [],
    episodes: [episode],
    activeEpisodeId: episode.id,
    lastSavedAt: null,
  }
}
