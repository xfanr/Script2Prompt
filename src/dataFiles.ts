import { normalizeGlobalConfig } from './config'
import { APP_VERSION } from './defaults'
import { normalizeAppState } from './stateNormalization'
import type { AppState, Episode, EpisodeGroup, GlobalConfig } from './types'

export const FILE_FORMAT_VERSION = 1
export interface SettingsFile {
  formatVersion: 1
  appVersion: number
  kind: 'settings'
  globalConfig: GlobalConfig
}
export interface GroupFile {
  formatVersion: 1
  appVersion: number
  kind: 'group'
  group: (Omit<EpisodeGroup, 'promptProfileId'> & { promptProfileSlot: number }) | null
  episodes: Episode[]
}
export type DataFile = SettingsFile | GroupFile
export const groupFilePath = (id: string) => `groups/${encodeURIComponent(id)}.json`

export function buildDataFiles(state: AppState): Map<string, DataFile> {
  const files = new Map<string, DataFile>()
  files.set('settings.json', {
    formatVersion: FILE_FORMAT_VERSION, appVersion: APP_VERSION, kind: 'settings',
    globalConfig: state.globalConfig,
  })
  for (const group of [null, ...state.episodeGroups]) {
    const { promptProfileId, ...metadata } = group ?? { promptProfileId: '' }
    const file: GroupFile = {
      formatVersion: FILE_FORMAT_VERSION, appVersion: APP_VERSION, kind: 'group',
      group: group ? {
        ...metadata as Omit<EpisodeGroup, 'promptProfileId'>,
        promptProfileSlot: Math.max(0, state.globalConfig.prompt.profiles.findIndex((profile) => profile.id === promptProfileId)),
      } : null,
      episodes: state.episodes.filter((episode) => episode.groupId === (group?.id ?? null)),
    }
    files.set(group ? groupFilePath(group.id) : 'ungrouped.json', file)
  }
  return files
}

function object(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseDataFile(text: string, path: string): DataFile {
  try {
    const value: unknown = JSON.parse(text)
    if (!object(value) || value.formatVersion !== FILE_FORMAT_VERSION
      || !Number.isInteger(value.appVersion) || value.appVersion < 1 || value.appVersion > APP_VERSION) throw new Error()
    if (path === 'settings.json') {
      if (value.kind !== 'settings' || !normalizeGlobalConfig(value.globalConfig)) throw new Error()
      return value as unknown as SettingsFile
    }
    if (value.kind !== 'group' || !Array.isArray(value.episodes)) throw new Error()
    const group = value.group
    if (path === 'ungrouped.json') {
      if (group !== null) throw new Error()
    } else if (!object(group) || typeof group.id !== 'string' || !group.id
      || groupFilePath(group.id) !== path || typeof group.title !== 'string'
      || typeof group.archived !== 'boolean' || typeof group.starred !== 'boolean'
      || !Number.isInteger(group.promptProfileSlot) || group.promptProfileSlot < 0 || group.promptProfileSlot > 2) throw new Error()
    const ids = new Set<string>()
    for (const episode of value.episodes) {
      if (!object(episode) || typeof episode.id !== 'string' || !episode.id || ids.has(episode.id)
        || typeof episode.title !== 'string' || episode.groupId !== (group?.id ?? null)
        || !Array.isArray(episode.shots) || !Array.isArray(episode.characters)
        || episode.characters.some((character: unknown) => typeof character !== 'string' && (
          !object(character)
          || typeof character.name !== 'string'
          || (character.appearanceDescription !== undefined && typeof character.appearanceDescription !== 'string')
        ))
        || !Array.isArray(episode.scenes)) throw new Error()
      ids.add(episode.id)
      const shotIds = new Set<string>()
      for (const shot of episode.shots) {
        if (!object(shot) || typeof shot.id !== 'string' || !shot.id || shotIds.has(shot.id)
          || typeof shot.text !== 'string' || !Array.isArray(shot.characters)
          || shot.characters.some((character: unknown) => !object(character) || typeof character.name !== 'string')
          || !Array.isArray(shot.scenes) || shot.scenes.some((scene: unknown) => !object(scene) || typeof scene.name !== 'string')) throw new Error()
        shotIds.add(shot.id)
      }
    }
    return value as unknown as GroupFile
  } catch {
    throw new Error(`文件损坏或格式不受支持：${path}`)
  }
}

export function assembleDataFiles(files: Map<string, DataFile>, ui: Pick<AppState, 'activeEpisodeId' | 'shotViewMode' | 'singleExpandedShotId' | 'lastSavedAt'>): AppState {
  const settings = files.get('settings.json')
  if (settings?.kind !== 'settings' || !files.has('ungrouped.json')) throw new Error('缺少 settings.json 或 ungrouped.json')
  const groups: EpisodeGroup[] = []
  const episodes: Episode[] = []
  const ids = new Set<string>()
  for (const file of files.values()) {
    if (file.kind !== 'group') continue
    if (file.group) {
      const { promptProfileSlot, ...group } = file.group
      groups.push({ ...group, promptProfileId: settings.globalConfig.prompt.profiles[promptProfileSlot].id })
    }
    for (const episode of file.episodes) {
      if (ids.has(episode.id)) throw new Error(`单集同时出现在多个分组：${episode.title}（${episode.id}）`)
      ids.add(episode.id)
      episodes.push(episode)
    }
  }
  return normalizeAppState({ ...ui, version: APP_VERSION, globalConfig: settings.globalConfig, episodeGroups: groups, episodes }, settings.globalConfig)
}

export function mergeDownloadedFiles(local: AppState, downloaded: Map<string, DataFile>) {
  // Keeping the local-only files also preserves their profile slots when settings change.
  const files = buildDataFiles(local)
  for (const [path, file] of downloaded) files.set(path, file)
  return assembleDataFiles(files, local)
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
