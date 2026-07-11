export type CompletionStatus = 'incomplete' | 'complete'
export type ShotViewMode = 'expanded' | 'collapse-completed' | 'hide-completed'
export type SceneTime = '白天' | '深夜'
export type SceneSpace = '室内' | '室外'
export type SectionKey = 'base' | 'sceneRole' | 'shot'

export interface SectionConfig {
  key: SectionKey
  title: string
  order: number
  enabled: boolean
}

export interface DurationRange {
  min: number
  max: number
}

export interface DialogueReplacementRule {
  id: string
  forbidden: string
  replacement: string
}

export interface GlobalConfig {
  baseSetting: string
  baseSettingSuffix: string
  sceneRoleSuffix: string
  recommendedDurationRange: DurationRange
  dialogueReplacementRules: DialogueReplacementRule[]
  sections: SectionConfig[]
}

export interface SceneConfig {
  id: string
  name: string
  time: SceneTime
  space: SceneSpace
  statusText?: string
}

export interface SceneAsset {
  name: string
  time: SceneTime
  space: SceneSpace
}

export interface CharacterConfig {
  id: string
  name: string
  includeVoice: boolean
  includeState: boolean
  statusText?: string
}

export interface DetectedCharacter {
  name: string
  includeVoice: boolean
}

export interface PendingDetection {
  id: string
  detected: DetectedCharacter[]
  currentNames: string[]
  mergeNames: string[]
  replaceNames: string[]
  voiceSuggestions: string[]
}


export interface AutoSyncNotice {
  id: string
  message: string
}

export interface PromptReview {
  rating: number
  drawCount: number
  noSubtitleCount: number
  note: string
}

export interface EpisodeProductionData {
  pointUsage: number
  pointCost: number
  productionDate: string
}

export interface Shot {
  id: string
  text: string
  remark: string
  connectPrevious: boolean
  connectNext: boolean
  scenes: SceneConfig[]
  usePositionReference: boolean
  characters: CharacterConfig[]
  status: CompletionStatus
  review: PromptReview
  pendingDetection: PendingDetection | null
  autoSyncNotice: AutoSyncNotice | null
  undoCharacters: CharacterConfig[] | null
}

export interface EpisodeGroup {
  id: string
  title: string
  starred: boolean
  archived: boolean
}

export interface Episode {
  id: string
  title: string
  groupId: string | null
  starred: boolean
  characters: string[]
  scenes: SceneAsset[]
  props: string[]
  productionData: EpisodeProductionData
  scriptText: string
  shots: Shot[]
}

export interface AppState {
  version: number
  shotViewMode: ShotViewMode
  globalConfig: GlobalConfig
  episodeGroups: EpisodeGroup[]
  episodes: Episode[]
  activeEpisodeId: string
  lastSavedAt: string | null
}

export interface ExportPayload {
  version: number
  exportedAt: string
  episode?: Episode
  episodes?: Episode[]
  episodeGroups?: EpisodeGroup[]
  globalConfigSnapshot: GlobalConfig
}
