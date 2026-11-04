import type { AppState, CharacterAsset, CharacterConfig, ContactPersonOption, DialogueReplacementRule, Episode, EpisodeGroup, EpisodeProductionData, GlobalConfig, PromptReview, ReviewNotePrefixOption, SceneAsset, SceneConfig, SceneSpace, SceneTime, Shot } from './types'

export const STORAGE_KEY = 'script2prompt.appState.v1'
export const APP_VERSION = 12
export const DEFAULT_ENSEMBLE_APPEARANCE_TEMPLATE = '一组外貌、发型和服装各不相同的角色，保持个体差异，避免重复面孔。'

export function normalizeMaterialConfirmations(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).map(name => name.trim()))] : []
}

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

export function createCharacterAsset(name = '', appearanceDescription = '', voiceDescription = '', isEnsemble = /(?:们|群像|若干)$/.test(name.trim())): CharacterAsset {
  return {
    id: createId('asset'),
    outfits: [],
    name,
    note: '',
    isEnsemble,
    isMain: false,
    availableUnits: [],
    appearanceDescription,
    appearanceDescriptionEnabled: false,
    voiceDescription,
    voiceDescriptionEnabled: false,
  }
}

export function normalizeCharacterAssets(value: unknown): CharacterAsset[] {
  if (!Array.isArray(value)) {
    return []
  }

  const assets = value.map((item) => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? { ...createCharacterAsset(name, '', '', false), availableUnits: null } : null
    }

    if (!item || typeof item !== 'object') {
      return null
    }

    const asset = item as Partial<CharacterAsset>
    const name = typeof asset.name === 'string' ? asset.name.trim() : ''

    if (!name) return null
    const normalized = createCharacterAsset(name, typeof asset.appearanceDescription === 'string' ? asset.appearanceDescription : '', typeof asset.voiceDescription === 'string' ? asset.voiceDescription : '', asset.isEnsemble === true)
    if (typeof asset.id === 'string' && asset.id) normalized.id = asset.id
    normalized.isMain = asset.isMain === true
    if (normalized.isMain) normalized.isEnsemble = false
    normalized.availableUnits = Array.isArray(asset.availableUnits) ? asset.availableUnits.filter(unit => unit && typeof unit.episodeId === 'string' && Number.isInteger(unit.unitNumber) && unit.unitNumber > 0)
      .map(unit => ({ episodeId: unit.episodeId, unitNumber: unit.unitNumber })) : null
    normalized.note = typeof asset.note === 'string' ? asset.note.trim() : ''
    normalized.appearanceDescriptionEnabled = asset.appearanceDescriptionEnabled === true
    normalized.voiceDescriptionEnabled = asset.voiceDescriptionEnabled === true
    normalized.outfits = Array.isArray(asset.outfits) ? asset.outfits.filter(outfit => outfit && typeof outfit === 'object').map((outfit) => ({
      id: typeof outfit.id === 'string' && outfit.id ? outfit.id : createId('outfit'),
      note: typeof outfit.note === 'string' ? outfit.note.trim() : '',
      appearanceDescription: typeof outfit.appearanceDescription === 'string' ? outfit.appearanceDescription : '',
      appearanceDescriptionEnabled: outfit.appearanceDescriptionEnabled === true,
      units: Array.isArray(outfit.units) ? outfit.units.filter((unit) => unit && typeof unit.episodeId === 'string' && Number.isInteger(unit.unitNumber) && unit.unitNumber > 0) : [],
    })) : []
    if (normalized.outfits.length > 1) normalized.appearanceDescription = ''
    else if (normalized.outfits.length === 1) {
      normalized.appearanceDescription = normalized.outfits[0].appearanceDescription
      normalized.appearanceDescriptionEnabled = normalized.outfits[0].appearanceDescriptionEnabled
      normalized.note = normalized.outfits[0].note || normalized.note
      normalized.outfits = []
    }
    return normalized
  }).filter((item): item is CharacterAsset => Boolean(item))

  return assets.filter((item, index, list) => list.findIndex((candidate) => candidate.name === item.name) === index)
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

export function normalizeShotSceneSelection(scenes: SceneConfig[]): SceneConfig[] {
  return [scenes.find((scene) => scene.name.trim()) ?? scenes[0] ?? createSceneConfig()]
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

export function createContactPersonOption(label = ''): ContactPersonOption {
  return { id: createId('contact-person'), label }
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
    characterId: null,
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
    thirtySecondMode: true,
    unitNumber: normalizedUnitNumber,
    referenceShotNumber: null,
    connectPrevious: false,
    connectPreviousCount: 0,
    connectNext: false,
    connectNextCount: 0,
    scenes: [createSceneConfig()],
    usePositionReference: true,
    useReverseAngle: false,
    firstFrameMode: false,
    characters: [],
    timingSegments: [],
    status: 'incomplete',
    review: createPromptReview(),
    pendingDetection: null,
    autoSyncNotice: null,
    undoCharacters: null,
  }
}

export function createEpisodeGroup(promptProfileId: string): EpisodeGroup {
  return {
    confirmedMaterialReferences: [],
    characters: [],
    id: createId('group'),
    title: '新剧集',
    fullName: '',
    starred: false,
    archived: false,
    promptProfileId,
    results: { playCount: 0, commission: 0, received: false },
    colorGrading: false,
    filter: false,
    referenceMode: 'detailed',
  }
}

export function formatEpisodeTitle(index: number) {
  const normalizedIndex = Math.max(1, Math.trunc(index))
  return `第 ${String(normalizedIndex).padStart(2, '0')} 集`
}

export function createEpisode(index = 1, pointCost = 0): Episode {
  return {
    showPreviousEpisodeUnit: false,
    showNextEpisodeUnit: false,
    confirmedMaterialReferences: [],
    id: createId('episode'),
    title: formatEpisodeTitle(index),
    characters: [],
    groupId: null,
    starred: false,
    contactPerson: '',
    splitEpisodeNumber: null,
    scenes: [],
    props: [],
    productionData: createEpisodeProductionData(pointCost),
    scriptText: '',
    splitScriptText: null,
    extractedDialogueText: null,
    shots: [createShot()],
  }
}

export function createInitialState(defaultGlobalConfig: GlobalConfig): AppState {
  const globalConfig = JSON.parse(JSON.stringify(defaultGlobalConfig)) as GlobalConfig
  const episode = createEpisode(1)

  return {
    version: APP_VERSION,
    shotViewMode: 'expanded',
    singleExpandedShotId: null,
    globalConfig,
    pointInvoices: [],
    episodeGroups: [],
    episodes: [episode],
    activeEpisodeId: episode.id,
    lastSavedAt: null,
  }
}
