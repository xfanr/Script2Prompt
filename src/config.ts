import { normalizeDialogueReplacementRules } from './dialogue'
import { APP_VERSION, createId, createReviewNotePrefixOption, normalizeReviewNotePrefixOptions, STORAGE_KEY } from './defaults'
import type { DialogueReplacementRule, GlobalConfig, PromptProfile, ReviewNotePrefixOption } from './types'

const RUNTIME_CONFIG_SCHEMA_VERSION = 1
const RUNTIME_CONFIG_CACHE_KEY = 'script2prompt.runtimeDefaultConfig.v1'
const PROMPT_PROFILE_NAMES = ['公真人', '公3D', '真人', '3D'] as const
const PROMPT_PROFILE_SLOT_COUNT = PROMPT_PROFILE_NAMES.length

type UnknownRecord = Record<string, unknown>

type LegacyGlobalConfig = {
  baseSetting?: unknown
  baseSettingSuffix?: unknown
  sceneRoleSuffix?: unknown
  recommendedDurationRange?: unknown
  defaultPointCost?: unknown
  dialogueReplacementRules?: unknown
  reviewNotePrefixOptions?: unknown
}

export function cloneGlobalConfig(config: GlobalConfig): GlobalConfig {
  return JSON.parse(JSON.stringify(config)) as GlobalConfig
}

export function activePromptProfile(config: GlobalConfig, profileId = config.prompt.activeProfileId): PromptProfile {
  return config.prompt.profiles.find((profile) => profile.id === profileId)
    ?? config.prompt.profiles.find((profile) => profile.id === config.prompt.activeProfileId)
    ?? config.prompt.profiles[0]
}

export async function loadInitialGlobalConfig(): Promise<GlobalConfig> {
  return loadStoredUserConfig() ?? loadRuntimeDefaultConfig()
}

export function normalizeGlobalConfig(value: unknown): GlobalConfig | null {
  if (!isRecord(value) || !isRecord(value.prompt) || !isRecord(value.dataCollection) || !isRecord(value.dialogueExtraction)) {
    return null
  }

  const profiles = normalizePromptProfiles(value.prompt.profiles)

  if (!profiles) {
    return null
  }

  const activeProfileId = normalizedRequiredString(value.prompt.activeProfileId)

  if (!activeProfileId || !profiles.some((profile) => profile.id === activeProfileId)) {
    return null
  }

  const prompt = normalizePromptProfileSlots(profiles, activeProfileId)
  const durationRange = normalizeDurationRange(value.dataCollection.recommendedDurationRange)
  const defaultPointCost = value.dataCollection.defaultPointCost
  const reviewNotePrefixOptions = normalizeReviewOptions(value.dataCollection.reviewNotePrefixOptions)
  const replacementRules = normalizeDialogueRules(value.dialogueExtraction.replacementRules)

  if (
    !durationRange
    || typeof defaultPointCost !== 'number'
    || !Number.isFinite(defaultPointCost)
    || defaultPointCost < 0
    || !reviewNotePrefixOptions
    || !replacementRules
  ) {
    return null
  }

  return {
    prompt,
    dataCollection: {
      recommendedDurationRange: durationRange,
      defaultPointCost: Number(defaultPointCost.toFixed(4)),
      reviewNotePrefixOptions,
    },
    dialogueExtraction: {
      replacementRules,
    },
  }
}

export async function loadRuntimeDefaultConfig(options: { fresh?: boolean } = {}): Promise<GlobalConfig> {
  try {
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`
    const response = await fetch(`${baseUrl}config/default-config.json`, {
      cache: options.fresh ? 'no-store' : 'default',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json() as UnknownRecord

    if (payload.schemaVersion !== RUNTIME_CONFIG_SCHEMA_VERSION) {
      throw new Error('unsupported schema version')
    }

    const config = normalizeGlobalConfig(payload)

    if (!config) {
      throw new Error('invalid default config')
    }

    localStorage.setItem(RUNTIME_CONFIG_CACHE_KEY, JSON.stringify({
      schemaVersion: RUNTIME_CONFIG_SCHEMA_VERSION,
      ...config,
    }))
    return config
  } catch (error) {
    if (!options.fresh) {
      const cached = loadCachedRuntimeConfig()

      if (cached) {
        return cached
      }
    }

    throw error
  }
}

export function normalizeGlobalConfigSnapshot(
  value: unknown,
  storedVersion: number,
  fallback: GlobalConfig,
): GlobalConfig | null {
  const normalized = normalizeGlobalConfig(value)

  if (normalized) {
    return normalized
  }

  if (!isRecord(value) || !hasLegacyConfigField(value)) {
    return null
  }

  return migrateLegacyGlobalConfig(value, storedVersion, fallback)
}

export function migrateLegacyGlobalConfig(
  value: unknown,
  storedVersion: number,
  fallback: GlobalConfig,
): GlobalConfig {
  const legacy = isRecord(value) ? value as LegacyGlobalConfig : {}
  const fallbackProfile = activePromptProfile(fallback)
  const profileId = createId('prompt-profile')
  const legacyProfile = {
    id: profileId,
    name: '方案 1',
    basePrefix: stringValue(legacy.baseSetting, fallbackProfile.basePrefix),
    baseSuffix: stringValue(legacy.baseSettingSuffix, fallbackProfile.baseSuffix),
    sceneRolePrefix: '',
    sceneRoleSuffix: stringValue(legacy.sceneRoleSuffix, fallbackProfile.sceneRoleSuffix),
    shotPrefix: '',
  }
  const legacyRange = isRecord(legacy.recommendedDurationRange) ? legacy.recommendedDurationRange : {}
  const min = finiteNumber(legacyRange.min, fallback.dataCollection.recommendedDurationRange.min)
  const max = finiteNumber(legacyRange.max, fallback.dataCollection.recommendedDurationRange.max)
  const defaultPointCost = finiteNumber(legacy.defaultPointCost, fallback.dataCollection.defaultPointCost)
  const dialogueRules = Array.isArray(legacy.dialogueReplacementRules)
    ? normalizeDialogueReplacementRules(legacy.dialogueReplacementRules)
    : cloneGlobalConfig(fallback).dialogueExtraction.replacementRules
  const reviewOptions = Array.isArray(legacy.reviewNotePrefixOptions)
    ? normalizeReviewNotePrefixOptions(legacy.reviewNotePrefixOptions)
    : cloneGlobalConfig(fallback).dataCollection.reviewNotePrefixOptions

  if (storedVersion < 2) {
    insertReviewOption(reviewOptions, '模型失误', '渲染定位图', '动作')
    insertReviewOption(reviewOptions, '抽卡失误', '内容过多', '引用错乱')
  }

  return {
    prompt: normalizePromptProfileSlots([legacyProfile], profileId),
    dataCollection: {
      recommendedDurationRange: {
        min: Math.min(min, max),
        max: Math.max(min, max),
      },
      defaultPointCost: Math.max(0, Number(defaultPointCost.toFixed(4))),
      reviewNotePrefixOptions: reviewOptions,
    },
    dialogueExtraction: {
      replacementRules: dialogueRules,
    },
  }
}

export function mergeGlobalConfigs(current: GlobalConfig, imported: GlobalConfig): GlobalConfig {
  const result = cloneGlobalConfig(current)

  result.dataCollection.reviewNotePrefixOptions = normalizeReviewNotePrefixOptions([
    ...result.dataCollection.reviewNotePrefixOptions,
    ...imported.dataCollection.reviewNotePrefixOptions,
  ])
  result.dialogueExtraction.replacementRules = normalizeDialogueReplacementRules([
    ...imported.dialogueExtraction.replacementRules,
    ...result.dialogueExtraction.replacementRules,
  ])

  return result
}

function loadCachedRuntimeConfig() {
  const raw = localStorage.getItem(RUNTIME_CONFIG_CACHE_KEY)

  if (!raw) {
    return null
  }

  try {
    const payload = JSON.parse(raw) as UnknownRecord
    return payload.schemaVersion === RUNTIME_CONFIG_SCHEMA_VERSION ? normalizeGlobalConfig(payload) : null
  } catch {
    return null
  }
}

function loadStoredUserConfig() {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return null
  }

  try {
    const state = JSON.parse(raw) as UnknownRecord
    return state.version === APP_VERSION ? normalizeGlobalConfig(state.globalConfig) : null
  } catch {
    return null
  }
}

function normalizePromptProfiles(value: unknown): PromptProfile[] | null {
  if (!Array.isArray(value) || !value.length) {
    return null
  }

  const profiles: PromptProfile[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      return null
    }

    const id = normalizedRequiredString(item.id)
    const name = normalizedRequiredString(item.name)

    if (
      !id
      || !name
      || typeof item.basePrefix !== 'string'
      || typeof item.baseSuffix !== 'string'
      || typeof item.sceneRolePrefix !== 'string'
      || typeof item.sceneRoleSuffix !== 'string'
      || typeof item.shotPrefix !== 'string'
    ) {
      return null
    }

    profiles.push({
      id,
      name,
      basePrefix: item.basePrefix,
      baseSuffix: item.baseSuffix,
      sceneRolePrefix: item.sceneRolePrefix,
      sceneRoleSuffix: item.sceneRoleSuffix,
      shotPrefix: item.shotPrefix,
    })
  }

  const ids = new Set(profiles.map((profile) => profile.id))
  const names = new Set(profiles.map((profile) => profile.name))
  return ids.size === profiles.length && names.size === profiles.length ? profiles : null
}

function normalizePromptProfileSlots(profiles: PromptProfile[], activeProfileId: string) {
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
  const slots = profiles.slice(0, PROMPT_PROFILE_SLOT_COUNT)

  if (!slots.some((profile) => profile.id === activeProfile.id)) {
    slots[PROMPT_PROFILE_SLOT_COUNT - 1] = activeProfile
  }

  while (slots.length < PROMPT_PROFILE_SLOT_COUNT) {
    const slotNumber = slots.length + 1
    slots.push({
      ...activeProfile,
      id: uniquePromptSlotId(activeProfile.id, slotNumber, slots),
    })
  }

  return {
    activeProfileId: activeProfile.id,
    profiles: slots.map((profile, index) => ({
      ...profile,
      name: PROMPT_PROFILE_NAMES[index],
    })),
  }
}

function uniquePromptSlotId(sourceId: string, slotNumber: number, profiles: PromptProfile[]) {
  const usedIds = new Set(profiles.map((profile) => profile.id))
  const baseId = `${sourceId}-slot-${slotNumber}`
  let id = baseId
  let suffix = 2

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  return id
}

function normalizeDurationRange(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const min = value.min
  const max = value.max

  if (
    typeof min !== 'number'
    || typeof max !== 'number'
    || !Number.isFinite(min)
    || !Number.isFinite(max)
    || min < 3
    || max > 25
    || min > max
  ) {
    return null
  }

  return { min, max }
}

function normalizeReviewOptions(value: unknown): ReviewNotePrefixOption[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const options: ReviewNotePrefixOption[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      return null
    }

    const id = normalizedRequiredString(item.id)
    const category = normalizedRequiredString(item.category)
    const label = normalizedRequiredString(item.label)

    if (!id || !category || !label) {
      return null
    }

    options.push({ id, category, label })
  }

  const ids = new Set(options.map((option) => option.id))
  const paths = new Set(options.map((option) => `${option.category}→${option.label}`))
  return ids.size === options.length && paths.size === options.length ? options : null
}

function normalizeDialogueRules(value: unknown): DialogueReplacementRule[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const rules: DialogueReplacementRule[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      return null
    }

    const id = normalizedRequiredString(item.id)
    const forbidden = normalizedRequiredString(item.forbidden)

    if (!id || !forbidden || typeof item.replacement !== 'string') {
      return null
    }

    rules.push({ id, forbidden, replacement: item.replacement })
  }

  const ids = new Set(rules.map((rule) => rule.id))
  const forbiddenTerms = new Set(rules.map((rule) => rule.forbidden))
  return ids.size === rules.length && forbiddenTerms.size === rules.length ? rules : null
}

function insertReviewOption(options: ReviewNotePrefixOption[], category: string, label: string, afterLabel: string) {
  if (options.some((option) => option.category === category && option.label === label)) {
    return
  }

  const anchorIndex = options.findIndex((option) => option.category === category && option.label === afterLabel)
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : options.length
  options.splice(insertIndex, 0, createReviewNotePrefixOption(category, label))
}

function hasLegacyConfigField(value: UnknownRecord) {
  return [
    'baseSetting',
    'baseSettingSuffix',
    'sceneRoleSuffix',
    'recommendedDurationRange',
    'defaultPointCost',
    'dialogueReplacementRules',
    'reviewNotePrefixOptions',
    'sections',
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedRequiredString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
