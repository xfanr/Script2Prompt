export type CompletionStatus = 'incomplete' | 'complete'
export type ShotViewMode = 'expanded' | 'collapse-completed' | 'single-expanded'
export type SceneTime = '白天' | '深夜'
export type SceneSpace = '室内' | '室外' | '无'

export interface DurationRange {
  min: number
  max: number
}

export interface DialogueReplacementRule {
  id: string
  forbidden: string
  replacement: string
}

export interface ReviewNotePrefixOption {
  id: string
  category: string
  label: string
}

export interface PromptProfile {
  id: string
  name: string
  basePrefix: string
  baseSuffix: string
  sceneRolePrefix: string
  sceneRoleSuffix: string
  shotPrefix: string
}

export interface PromptConfig {
  activeProfileId: string
  profiles: PromptProfile[]
}

export interface DataCollectionConfig {
  recommendedDurationRange: DurationRange
  defaultPointCost: number
  reviewNotePrefixOptions: ReviewNotePrefixOption[]
}

export interface DialogueExtractionConfig {
  replacementRules: DialogueReplacementRule[]
}

export interface GlobalConfig {
  prompt: PromptConfig
  dataCollection: DataCollectionConfig
  dialogueExtraction: DialogueExtractionConfig
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
  notePrefix: string
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
  thirtySecondMode: boolean
  unitNumber: number
  connectPrevious: boolean
  connectPreviousCount: number
  connectNext: boolean
  connectNextCount: number
  scenes: SceneConfig[]
  usePositionReference: boolean
  useReverseAngle: boolean
  firstFrameMode: boolean
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
  promptProfileId: string
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
  singleExpandedShotId: string | null
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
