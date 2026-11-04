import type { AppState, CharacterAsset, CharacterUnit, Episode } from './types'

export function episodeCharacterUnits(episode: Episode): CharacterUnit[] {
  return [...new Set(episode.shots.map(shot => shot.unitNumber))].sort((a, b) => a - b)
    .map(unitNumber => ({ episodeId: episode.id, unitNumber }))
}

export function initializeCharacterScopes(state: AppState, episode: Episode, assets: CharacterAsset[], includeUnused = true) {
  const pending = assets.filter(asset => asset.availableUnits === null)
  if (!pending.length) return
  const episodes = state.episodes.filter(item => episode.groupId ? item.groupId === episode.groupId : item.id === episode.id)
  for (const asset of pending) {
    const used = episodes.filter(item => item.shots.some(shot => shot.characters.some(character => character.characterId === asset.id || character.name === asset.name)
      || [...shot.text.matchAll(/\[([^\[\]\r\n]+)\]/g)].some(match => match[1].trim().replace(/\.[a-z\d]+$/i, '').replace(/\.+$/u, '').trim() === asset.name)))
    if (used.length) asset.availableUnits = used.flatMap(episodeCharacterUnits)
    else if (includeUnused) asset.availableUnits = episodeCharacterUnits(episode)
  }
}

export function characterAvailableInUnit(asset: CharacterAsset, episodeId: string, unitNumber: number) {
  return asset.isMain || Boolean(asset.availableUnits?.some(unit => unit.episodeId === episodeId && unit.unitNumber === unitNumber))
}

export function compareCharacterAssets(a: CharacterAsset, b: CharacterAsset) {
  const rank = (asset: CharacterAsset) => asset.isMain ? 0 : asset.isEnsemble ? 1 : 2
  return rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base', numeric: true })
}

export function extendCharacterScopes(assets: CharacterAsset[], candidate: Episode, previous?: Episode) {
  for (const shot of candidate.shots) for (const character of shot.characters) {
    const asset = assets.find(asset => asset.id === character.characterId || asset.name === character.name)
    if (!asset || asset.isMain || characterAvailableInUnit(asset, candidate.id, shot.unitNumber)) continue
    const alreadyUsed = previous?.groupId === candidate.groupId && previous.shots.some(item => item.id === shot.id && item.unitNumber === shot.unitNumber && item.characters.some(item => item.characterId === asset.id || item.name === asset.name))
    if (!alreadyUsed) (asset.availableUnits ??= []).push({ episodeId: candidate.id, unitNumber: shot.unitNumber })
  }
}

export function mapCharacterUnitReferences(asset: CharacterAsset, map: (units: CharacterUnit[]) => CharacterUnit[]) {
  if (asset.availableUnits !== null) asset.availableUnits = map(asset.availableUnits)
  for (const outfit of asset.outfits) outfit.units = map(outfit.units)
}

export function pruneCharacterScopes(state: AppState) {
  const units = new Map(state.episodes.map(episode => [episode.id, { groupId: episode.groupId, numbers: new Set(episode.shots.map(shot => shot.unitNumber)) }]))
  const owners = [...state.episodeGroups.map(group => ({ groupId: group.id, episodeId: null, assets: group.characters ?? [] })),
    ...state.episodes.map(episode => ({ groupId: episode.groupId, episodeId: episode.id, assets: episode.characters }))]
  for (const owner of owners) {
    for (const asset of owner.assets) {
      if (asset.availableUnits === null) continue
      asset.availableUnits = asset.availableUnits.filter(unit => {
        const episode = units.get(unit.episodeId)
        return episode?.numbers.has(unit.unitNumber) && (owner.groupId ? episode.groupId === owner.groupId : unit.episodeId === owner.episodeId)
      })
    }
  }
}
